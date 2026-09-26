import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface PayoutRejectedEmailVars {
  email: string;
  firstName?: string;
  requestId: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface PayoutRejectedEmailOptions {
  idempotencyKey?: string;
}

export function buildPayoutRejectedMessage(
  to: string,
  vars: PayoutRejectedEmailVars,
  options?: PayoutRejectedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("payout-rejected", {
    ...vars,
    status: "REJECTED",
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Payout Request Update",
    html: rendered.html,
    text: rendered.text,
    templateId: "PAYOUT_REJECTED",
    idempotencyKey: options?.idempotencyKey,
  };
}
