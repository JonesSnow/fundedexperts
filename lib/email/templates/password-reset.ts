import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl, buildTokenUrl } from "../urls";

export interface PasswordResetEmailVars {
  email: string;
  firstName?: string;
  token: string;
  expiresAt: string;
}

export function buildPasswordResetMessage(
  to: string,
  vars: PasswordResetEmailVars,
  idempotencyKey?: string
): EmailMessage {
  const resetUrl = buildTokenUrl("/reset-password", vars.token);
  const rendered = renderEmailTemplate("password-reset", {
    ...vars,
    resetUrl,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Reset your password",
    html: rendered.html,
    text: rendered.text,
    templateId: "PASSWORD_RESET_REQUESTED",
    relatedEntityType: "Trader",
    relatedEntityId: vars.email,
    idempotencyKey,
  };
}
