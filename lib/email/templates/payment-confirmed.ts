import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface PaymentConfirmedEmailVars {
  email: string;
  firstName?: string;
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
  canActivate: boolean;
}

export interface PaymentConfirmedEmailOptions {
  idempotencyKey?: string;
}

export function buildPaymentConfirmedMessage(
  to: string,
  vars: PaymentConfirmedEmailVars,
  options?: PaymentConfirmedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("payment-confirmed", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Payment Confirmed",
    html: rendered.html,
    text: rendered.text,
    templateId: "PAYMENT_CONFIRMED",
    relatedEntityType: "Order",
    relatedEntityId: vars.orderId,
    idempotencyKey: options?.idempotencyKey,
  };
}
