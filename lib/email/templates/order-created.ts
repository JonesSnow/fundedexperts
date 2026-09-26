import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface OrderCreatedEmailVars {
  email: string;
  firstName?: string;
  orderId: string;
  orderNumber: string;
  productName: string;
  totalAmount: number;
  currency: string;
  orderStatus: string;
}

export interface OrderCreatedEmailOptions {
  idempotencyKey?: string;
}

export function buildOrderCreatedMessage(
  to: string,
  vars: OrderCreatedEmailVars,
  options?: OrderCreatedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("order-created", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Order Confirmation",
    html: rendered.html,
    text: rendered.text,
    templateId: "ORDER_CREATED",
    relatedEntityType: "Order",
    relatedEntityId: vars.orderId,
    idempotencyKey: options?.idempotencyKey,
  };
}
