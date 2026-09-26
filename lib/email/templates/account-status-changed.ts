import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface AccountStatusChangedEmailVars {
  email: string;
  firstName?: string;
  accountId: string;
  oldStatus: string;
  newStatus: string;
  reason?: string;
}

export interface AccountStatusChangedEmailOptions {
  idempotencyKey?: string;
}

export function buildAccountStatusChangedMessage(
  to: string,
  vars: AccountStatusChangedEmailVars,
  options?: AccountStatusChangedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("account-status-changed", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Account Status Changed",
    html: rendered.html,
    text: rendered.text,
    templateId: "ACCOUNT_STATUS_CHANGED",
    relatedEntityType: "FundedAccount",
    relatedEntityId: vars.accountId,
    idempotencyKey: options?.idempotencyKey,
  };
}
