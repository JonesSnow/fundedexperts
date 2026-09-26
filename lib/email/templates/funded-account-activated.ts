import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface FundedAccountActivatedEmailVars {
  email: string;
  firstName?: string;
  accountId: string;
  accountSize: string;
  status: string;
}

export interface FundedAccountActivatedEmailOptions {
  idempotencyKey?: string;
}

export function buildFundedAccountActivatedMessage(
  to: string,
  vars: FundedAccountActivatedEmailVars,
  options?: FundedAccountActivatedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("funded-account-activated", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Funded Account Activated",
    html: rendered.html,
    text: rendered.text,
    templateId: "FUNDED_ACCOUNT_ACTIVATED",
    relatedEntityType: "FundedAccount",
    relatedEntityId: vars.accountId,
    idempotencyKey: options?.idempotencyKey,
  };
}
