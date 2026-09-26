import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface PaymentFailedEmailVars {
  email: string;
  firstName?: string;
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
}

export interface PaymentFailedEmailOptions {
  idempotencyKey?: string;
}

export function buildPaymentFailedMessage(
  to: string,
  vars: PaymentFailedEmailVars,
  options?: PaymentFailedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("payment-failed", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Payment Failed",
    html: rendered.html,
    text: rendered.text,
    templateId: "PAYMENT_FAILED",
    relatedEntityType: "Order",
    relatedEntityId: vars.orderId,
    idempotencyKey: options?.idempotencyKey,
  };
}
