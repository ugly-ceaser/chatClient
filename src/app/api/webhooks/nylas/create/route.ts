import { NextResponse } from 'next/server';
import  Account  from '@/lib/account';

export async function POST(request: Request) {
    try {
        const { notificationUrl } = await request.json();
        const token = process.env.NYLAS_API_KEY; // Use server-side environment variable
        const account = new Account(token);

        const webhook = await account.createWebhook('message.created', notificationUrl);
        return NextResponse.json(webhook);
    } catch (error) {
        console.error('Error creating webhook:', error);
        return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
    }
}