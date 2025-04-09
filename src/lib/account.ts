import type { EmailHeader, EmailMessage, SyncResponse, SyncUpdatedResponse } from '@/lib/types';
import { db } from '@/server/db';
import axios from 'axios';
import { syncEmailsToDatabase } from './sync-to-db';

//const NYLAS_API_BASE_URL = 'https://api.nylas.com';
const NYLAS_API_BASE_URL = 'https://api.eu.nylas.com/v3';

class Account {
    private token: string;

    constructor(token: any) {
        this.token = token;
    }

    /**
     * Start a sync with Nylas.
     */
    private async startSync(daysWithin: number): Promise<SyncResponse> {
        const response = await axios.post<SyncResponse>(
            `${NYLAS_API_BASE_URL}/delta/sync`,
            {},
            {
                headers: { Authorization: `Bearer ${this.token}` },
                params: {
                    daysWithin,
                    bodyType: 'html',
                },
            }
        );
        return response.data;
    }

    /**
     * Create a webhook subscription with Nylas.
     */
    async createSubscription() {
        const webhookUrl =
            process.env.NODE_ENV === 'development'
                ? 'https://potatoes-calculator-reports-crisis.trycloudflare.com'
                : process.env.NEXT_PUBLIC_URL;

        const res = await axios.post(
            `${NYLAS_API_BASE_URL}/webhooks`,
            {
                callbackUrl: `${webhookUrl}/api/nylas/webhook`,
                triggers: ['message.created', 'message.updated', 'message.deleted'],
            },
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return res.data;
    }

    /**
     * Sync emails using Nylas's delta sync.
     */
    async syncEmails() {
        const account = await db.account.findUnique({
            where: {
                token: this.token,
            },
        });
        if (!account) throw new Error('Invalid token');
        if (!account.nextDeltaToken) throw new Error('No delta token');

        let response = await this.getUpdatedEmails({ deltaToken: account.nextDeltaToken });
        let allEmails: EmailMessage[] = response.records;
        let storedDeltaToken = account.nextDeltaToken;

        if (response.nextDeltaToken) {
            storedDeltaToken = response.nextDeltaToken;
        }

        while (response.nextPageToken) {
            response = await this.getUpdatedEmails({ pageToken: response.nextPageToken });
            allEmails = allEmails.concat(response.records);
            if (response.nextDeltaToken) {
                storedDeltaToken = response.nextDeltaToken;
            }
        }

        if (!response) throw new Error('Failed to sync emails');

        try {
            await syncEmailsToDatabase(allEmails, account.id);
        } catch (error) {
            console.log('error', error);
        }

        await db.account.update({
            where: {
                id: account.id,
            },
            data: {
                nextDeltaToken: storedDeltaToken,
            },
        });
    }

    /**
     * Get updated emails using Nylas's delta sync.
     */
    async getUpdatedEmails({ deltaToken, pageToken }: { deltaToken?: string; pageToken?: string }): Promise<SyncUpdatedResponse> {
        let params: Record<string, string> = {};
        if (deltaToken) {
            params.cursor = deltaToken;
        }
        if (pageToken) {
            params.pageToken = pageToken;
        }

        const response = await axios.get<SyncUpdatedResponse>(`${NYLAS_API_BASE_URL}/delta/sync`, {
            params,
            headers: { Authorization: `Bearer ${this.token}` },
        });
        return response.data;
    }

    /**
     * Perform an initial sync of emails using Nylas.
     */
    async performInitialSync() {
        try {
            // Start the sync process
            const daysWithin = 3;
            let syncResponse = await this.startSync(daysWithin); // Sync emails from the last 3 days

            // Wait until the sync is ready
            while (!syncResponse.ready) {
                await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second
                syncResponse = await this.startSync(daysWithin);
            }

            // Perform initial sync of updated emails
            let storedDeltaToken: string = syncResponse.syncUpdatedToken;
            let updatedResponse = await this.getUpdatedEmails({ deltaToken: syncResponse.syncUpdatedToken });
            let allEmails: EmailMessage[] = updatedResponse.records;

            // Fetch all pages if there are more
            while (updatedResponse.nextPageToken) {
                updatedResponse = await this.getUpdatedEmails({ pageToken: updatedResponse.nextPageToken });
                allEmails = allEmails.concat(updatedResponse.records);
                if (updatedResponse.nextDeltaToken) {
                    storedDeltaToken = updatedResponse.nextDeltaToken;
                }
            }

            return {
                emails: allEmails,
                deltaToken: storedDeltaToken,
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('Error during sync:', JSON.stringify(error.response?.data, null, 2));
            } else {
                console.error('Error during sync:', error);
            }
        }
    }

    /**
     * Send an email using Nylas.
     */
    async sendEmail({
        from,
        subject,
        body,
        inReplyTo,
        references,
        threadId,
        to,
        cc,
        bcc,
        replyTo,
    }: {
        from: EmailAddress;
        subject: string;
        body: string;
        inReplyTo?: string;
        references?: string;
        threadId?: string;
        to: EmailAddress[];
        cc?: EmailAddress[];
        bcc?: EmailAddress[];
        replyTo?: EmailAddress;
    }) {
        try {
            const response = await axios.post(
                `${NYLAS_API_BASE_URL}/emails/send`,
                {
                    from,
                    subject,
                    body,
                    inReplyTo,
                    references,
                    threadId,
                    to,
                    cc,
                    bcc,
                    replyTo,
                },
                {
                    headers: { Authorization: `Bearer ${this.token}` },
                }
            );

            console.log('sendmail', response.data);
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('Error sending email:', JSON.stringify(error.response?.data, null, 2));
            } else {
                console.error('Error sending email:', error);
            }
            throw error;
        }
    }

    /**
     * Get active webhooks from Nylas.
     */
    async getWebhooks() {
        type Response = {
            records: {
                id: string;
                callbackUrl: string;
                state: string;
                triggers: string[];
            }[];
        };

        const res = await axios.get<Response>(`${NYLAS_API_BASE_URL}/webhooks`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
        });
        return res.data;
    }

    /**
     * Create a webhook with Nylas.
     */
    async createWebhook(resource: string, notificationUrl: string) {
        const res = await axios.post(
            `${NYLAS_API_BASE_URL}/webhooks`,
            {
                callbackUrl: notificationUrl,
                triggers: [resource],
            },
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return res.data;
    }

    /**
     * Delete a webhook with Nylas.
     */
    async deleteWebhook(subscriptionId: string) {
        const res = await axios.delete(`${NYLAS_API_BASE_URL}/webhooks/${subscriptionId}`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
        });
        return res.data;
    }
}

type EmailAddress = {
    name: string;
    address: string;
};

export default Account;