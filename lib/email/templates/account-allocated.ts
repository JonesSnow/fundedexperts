import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface AccountAllocatedEmailVars {
  email: string;
  firstName?: string;
  evaluationId: string;
  accountNumber: string;
}

export interface AccountAllocatedEmailOptions {
  idempotencyKey?: string;
}

export function buildAccountAllocatedMessage(
  to: string,
  vars: AccountAllocatedEmailVars,
  options?: AccountAllocatedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("account-allocated", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Trading Account Allocated",
    html: rendered.html,
    text: rendered.text,
    templateId: "ACCOUNT_ALLOCATED",
    relatedEntityType: "Evaluation",
    relatedEntityId: vars.evaluationId,
    idempotencyKey: options?.idempotencyKey,
  };
}
