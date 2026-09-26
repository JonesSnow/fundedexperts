export type EmailEventType =
  | "EMAIL_VERIFICATION_REQUESTED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_CHANGED"
  | "WELCOME"
  | "LOGIN_SECURITY_ALERT"
  | "ORDER_CREATED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "EVALUATION_STARTED"
  | "EVALUATION_PASSED"
  | "EVALUATION_FAILED"
  | "ACCOUNT_ALLOCATED"
  | "FUNDED_ACCOUNT_ACTIVATED"
  | "ACCOUNT_STATUS_CHANGED"
  | "RULE_BREACH_CONFIRMED"
  | "PAYOUT_REQUESTED"
  | "PAYOUT_APPROVED"
  | "PAYOUT_REJECTED"
  | "SYSTEM_ALERT";

export const EMAIL_EVENTS: readonly EmailEventType[] = [
  "EMAIL_VERIFICATION_REQUESTED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_CHANGED",
  "WELCOME",
  "LOGIN_SECURITY_ALERT",
  "ORDER_CREATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_FAILED",
  "EVALUATION_STARTED",
  "EVALUATION_PASSED",
  "EVALUATION_FAILED",
  "ACCOUNT_ALLOCATED",
  "FUNDED_ACCOUNT_ACTIVATED",
  "ACCOUNT_STATUS_CHANGED",
  "RULE_BREACH_CONFIRMED",
  "PAYOUT_REQUESTED",
  "PAYOUT_APPROVED",
  "PAYOUT_REJECTED",
  "SYSTEM_ALERT",
];

export type EmailDeliveryStatus = "QUEUED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

export type EmailProvider = "gmail-smtp" | "console" | "none";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  templateId?: EmailEventType;
  userId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  deliveryId?: string;
}

export interface EmailSendOptions {
  providerOverride?: EmailProvider;
}

export interface EmailProviderInstance {
  send(message: EmailMessage): Promise<EmailSendResult>;
  validateConfig(): boolean;
  getName(): string;
}
