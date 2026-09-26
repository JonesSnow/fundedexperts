import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface PayoutRequestedEmailVars {
  email: string;
  firstName?: string;
  requestId: string;
  amount: number;
  currency: string;
  status: string;
}

export interface PayoutRequestedEmailOptions {
  idempotencyKey?: string;
}

export function buildPayoutRequestedMessage(
  to: string,
  vars: PayoutRequestedEmailVars,
  options?: PayoutRequestedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("payout-requested", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Payout Request Received",
    html: rendered.html,
    text: rendered.text,
    templateId: "PAYOUT_REQUESTED",
    idempotencyKey: options?.idempotencyKey,
  };
}
