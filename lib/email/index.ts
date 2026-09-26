import { PrismaClient, EmailDeliveryStatus, EmailProviderType } from "@prisma/client";
import { EmailMessage, EmailSendResult, EmailEventType, EmailSendOptions, EmailProvider } from "./types";
import { GmailSmtpProvider } from "./provider";
import { ConsoleProvider } from "./console-provider";
import { getEmailConfig, validateEmailConfig } from "./config";
import { createLogger } from "@/lib/logger";
import type { EmailDelivery } from "@prisma/client";

const prisma = new PrismaClient();
const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

const PROVIDER_MAP: Record<EmailProvider, EmailProviderType> = {
  "gmail-smtp": "GMAIL_SMTP",
  console: "CONSOLE",
  none: "NONE",
};

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 5000];

function getProvider(): { provider: GmailSmtpProvider | ConsoleProvider; configValid: boolean } {
  const config = getEmailConfig();
  if (config.provider === "console") {
    return { provider: new ConsoleProvider(), configValid: true };
  }
  return { provider: new GmailSmtpProvider(), configValid: true };
}

export async function validateProductionConfig(): Promise<void> {
  const validation = validateEmailConfig();
  if (!validation.valid) {
    throw new Error(`Email configuration invalid: ${validation.errors.join(", ")}`);
  }
}

export async function sendEmail(
  message: EmailMessage,
  options?: EmailSendOptions
): Promise<EmailSendResult> {
  const config = getEmailConfig();

  if (config.provider === "console" && process.env.NODE_ENV === "production") {
    logger.error("EMAIL", "Console email mode is not allowed in production", {
      metadata: {
        template: message.templateId,
        recipientDomain: extractDomain(message.to),
      },
    });
    return {
      success: false,
      error: "Email configuration invalid: console mode not allowed in production",
    };
  }

  if (options?.providerOverride === "console" && process.env.NODE_ENV === "production") {
    logger.error("EMAIL", "Console email mode override not allowed in production", {
      metadata: {
        template: message.templateId,
      },
    });
    return {
      success: false,
      error: "Console email mode is not permitted in production",
    };
  }

  if (message.idempotencyKey) {
    const existing = await prisma.emailDelivery.findUnique({
      where: { idempotencyKey: message.idempotencyKey },
    });

    if (existing && existing.status === "SENT") {
      logger.info("EMAIL", "Email already sent — skipping", {
        metadata: {
          template: message.templateId,
          idempotencyKey: message.idempotencyKey,
          previousStatus: existing.status,
        },
      });
      return {
        success: true,
        providerMessageId: existing.providerMessageId ?? undefined,
        deliveryId: existing.id,
      };
    }
  }

  const delivery = await prisma.emailDelivery.create({
    data: {
      traderId: message.userId ?? null,
      recipient: message.to,
      template: message.templateId ?? "unknown",
      subject: message.subject,
      status: "QUEUED",
      provider: PROVIDER_MAP[config.provider],
      relatedEntityType: message.relatedEntityType ?? null,
      relatedEntityId: message.relatedEntityId ?? null,
      idempotencyKey: message.idempotencyKey ?? null,
    },
   });

   const { provider } = getProvider();

  let attempt = 0;
  let lastError: string | undefined;

  while (attempt < MAX_RETRIES) {
    attempt++;

    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENDING",
        attemptCount: attempt,
        lastAttemptAt: new Date(),
      },
    });

    const result = await provider.send(message);

    if (result.success) {
      await prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId ?? null,
          failureReason: null,
        },
      });

      logger.info("EMAIL", "Email sent successfully", {
        metadata: {
          template: message.templateId,
          provider: PROVIDER_MAP[config.provider],
          recipientDomain: extractDomain(message.to),
          providerMessageId: result.providerMessageId,
          relatedEntityType: message.relatedEntityType,
          relatedEntityId: message.relatedEntityId,
          attempt,
        },
      });

      return {
        success: true,
        providerMessageId: result.providerMessageId,
        deliveryId: delivery.id,
      };
    }

    lastError = result.error;

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt - 1] ?? 1000;
      await sleep(delay);
    }
  }

  await prisma.emailDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      failureReason: lastError ?? "Unknown error after retries",
    },
  });

  logger.error("EMAIL", "Email delivery failed after retries", {
    metadata: {
      template: message.templateId,
       provider: PROVIDER_MAP[config.provider],
       recipientDomain: extractDomain(message.to),
      attempts: attempt,
      error: lastError,
    },
  });

  return {
    success: false,
    error: lastError ?? "Email delivery failed",
    deliveryId: delivery.id,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractDomain(email: string): string {
  const atIdx = email.lastIndexOf("@");
  if (atIdx === -1) return "unknown";
  return email.substring(atIdx + 1);
}

export class EmailService {
  static async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    return validateEmailConfig();
  }

  static async send(message: EmailMessage, options?: EmailSendOptions): Promise<EmailSendResult> {
    return sendEmail(message, options);
  }

  static async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    return sendEmail(message);
  }

  static async getDelivery(id: string): Promise<EmailDelivery | null> {
    return prisma.emailDelivery.findUnique({ where: { id } });
  }

  static async listDeliveries(params: {
    traderId?: string;
    status?: EmailDeliveryStatus;
    template?: EmailEventType;
    limit?: number;
  }): Promise<EmailDelivery[]> {
    const where: Record<string, unknown> = {};
    if (params.traderId) where.traderId = params.traderId;
    if (params.status) where.status = params.status;
    if (params.template) where.template = params.template;

    return prisma.emailDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit ?? 50,
    });
  }
}

export { GmailSmtpProvider, ConsoleProvider };
