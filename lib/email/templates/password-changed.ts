import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface PasswordChangedEmailVars {
  email: string;
  firstName?: string;
  changedByAdmin?: boolean;
}

export interface PasswordChangedEmailOptions {
  idempotencyKey?: string;
}

export function buildPasswordChangedMessage(
  to: string,
  vars: PasswordChangedEmailVars,
  options?: PasswordChangedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("password-changed", {
    ...vars,
    changedByAdmin: vars.changedByAdmin ? "true" : "false",
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Your password was changed",
    html: rendered.html,
    text: rendered.text,
    templateId: "PASSWORD_CHANGED",
    relatedEntityId: vars.email,
    idempotencyKey: options?.idempotencyKey,
  };
}
