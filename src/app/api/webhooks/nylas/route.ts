import { NextResponse } from 'next/server';
import  Account  from '@/lib/account';

export async function GET() {
    try {
        const token = process.env.NYLAS_API_KEY; // Use server-side environment variable
        const account = new Account(token);

        const webhooks = await account.getWebhooks();
        return NextResponse.json(webhooks);
    } catch (error) {
        console.error('Error fetching webhooks:', error);
        return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
    }
}