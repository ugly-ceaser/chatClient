import { NextResponse } from 'next/server';
import  Account  from '@/lib/account';

export async function POST(request: Request) {
    try {
        const { webhookId } = await request.json();
        const token = process.env.NYLAS_API_KEY; // Use server-side environment variable
        const account = new Account(token);

        await account.deleteWebhook(webhookId);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting webhook:', error);
        return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
    }
}