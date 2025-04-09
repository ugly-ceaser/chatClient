import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { authoriseAccountAccess } from "./mail";
import Account from "@/lib/account";
import { TRPCError } from "@trpc/server";

export const webhooksRouter = createTRPCRouter({
  getWebhooks: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        // Authorize account access
        const acc = await authoriseAccountAccess(input.accountId, ctx.auth.userId);
        if (!acc) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You do not have access to this account.",
          });
        }

        // Fetch webhooks
        const account = new Account(acc.token);
        const webhooks = await account.getWebhooks();
        return webhooks;
      } catch (error) {
        console.error("Error in getWebhooks:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch webhooks.",
        });
      }
    }),

  createWebhook: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        notificationUrl: z.string().url("Invalid notification URL."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Authorize account access
        const acc = await authoriseAccountAccess(input.accountId, ctx.auth.userId);
        if (!acc) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You do not have access to this account.",
          });
        }

        // Create webhook
        const account = new Account(acc.token);
        const webhook = await account.createWebhook(
          "/email/messages",
          input.notificationUrl
        );
        return webhook;
      } catch (error) {
        console.error("Error in createWebhook:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create webhook.",
        });
      }
    }),

  deleteWebhook: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        webhookId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Authorize account access
        const acc = await authoriseAccountAccess(input.accountId, ctx.auth.userId);
        if (!acc) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You do not have access to this account.",
          });
        }

        // Delete webhook
        const account = new Account(acc.token);
        const result = await account.deleteWebhook(input.webhookId);
        return result;
      } catch (error) {
        console.error("Error in deleteWebhook:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete webhook.",
        });
      }
    }),
});