import { type NextRequest, NextResponse } from "next/server";
import { getNylas } from "@/lib/nylas";
import { db } from "@/server/db";
import { auth } from "@clerk/nextjs/server";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  const nylas = await getNylas();

  if (!userId) {
    return NextResponse.json({ error: "No user ID found" }, { status: 400 });
  }

  console.log("Received callback from Nylas");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "No authorization code returned from Nylas" },
      { status: 400 },
    );
  }

  const codeExchangePayload = {
    clientSecret: process.env.NYLAS_API_KEY as string,
    clientId: process.env.NYLAS_CLIENT_ID as string,
    redirectUri: `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/nylas`,
    code,
  };

  try {
    const response = await nylas.auth.exchangeCodeForToken(codeExchangePayload);
    const { grantId, email, idToken, provider } = response;
    // CHECK FOR ACCOUNT
    await db.$transaction(async (prisma) => {
      let account = await prisma.account.findFirst({
        where: { id: grantId, userId: idToken },
      });

      // CREATE ACCOUNT
      if (!account) {
        account = await prisma.account.create({
          data: {
            id: grantId,
            userId,
            token: idToken as string,
            provider: "Nylas",
            emailAddress: email,
            name: provider as string,
          },
        });
      } else {
        // UPDATE TOKEN
        await prisma.account.update({
          where: { id: grantId },
          data: { token: idToken as string },
        });
      }

      const emails = await nylas.messages.list({
        identifier: grantId,
        queryParams: {
          limit: 5,
        },
      });

      const hasThreads = await prisma.thread.findFirst({
        where: {
          accountId: grantId,
        },
      });

      if (!hasThreads) {
        for (const email of emails.data) {
          const thread = await prisma.thread.create({
            data: {
              accountId: grantId,
              subject: email.subject as string,
              lastMessageDate: new Date(email.date * 1000),
            },
          });

          let emailExists = await prisma.emailAddress.findFirst({
            where: {
              accountId: grantId,
              address: email?.from?.[0]?.email as string,
            },
          });

          // CHECK IF EMAIL EXISTS
          if(!emailExists) {  
            emailExists = await prisma.emailAddress.create({
              data: {
                accountId: grantId,
                address: email?.from?.[0]?.email as string,
                name: email.from?.[0]?.name,
              }
            })
          } else {
            emailExists = await prisma.emailAddress.update({
              where: { id: emailExists?.id },
              data: {
                accountId: grantId,
                address: email?.from?.[0]?.email as string,
                name: email.from?.[0]?.name,
              }
            });
          }
          

          await prisma.email.create({
            data: {
              threadId: thread.id,
              sentAt: new Date(email.date * 1000),
              createdTime: new Date(email.date * 1000),
              receivedAt: new Date(email.date * 1000),
              body: email.body as string,
              bodySnippet: email.snippet as string,
              fromId: emailExists.id!,
              hasAttachments: !!email?.attachments?.length,
              subject: email.subject as string,
              internetMessageId: email.id,
              lastModifiedTime: new Date(email.date * 1000),
            },
          });
        }
      }
    });

    // UPSERT MESSAGES
    return NextResponse.redirect(new URL("/mail", request.nextUrl.origin));
  } catch (error) {
    console.log({ error });
    return NextResponse.json(
      { error: "Failed to exchange authorization code for token" },
      { status: 500 },
    );
  }
}
