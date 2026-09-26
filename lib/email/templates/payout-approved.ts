import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface PayoutApprovedEmailVars {
  email: string;
  firstName?: string;
  requestId: string;
  amount: number;
  currency: string;
}

export interface PayoutApprovedEmailOptions {
  idempotencyKey?: string;
}

export function buildPayoutApprovedMessage(
  to: string,
  vars: PayoutApprovedEmailVars,
  options?: PayoutApprovedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("payout-approved", {
    ...vars,
    status: "APPROVED",
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Payout Approved",
    html: rendered.html,
    text: rendered.text,
    templateId: "PAYOUT_APPROVED",
    idempotencyKey: options?.idempotencyKey,
  };
}
