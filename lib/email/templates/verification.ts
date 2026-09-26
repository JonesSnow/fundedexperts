import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl, buildTokenUrl } from "../urls";

export interface VerificationEmailVars {
  email: string;
  firstName?: string;
  token: string;
  expiresAt: string;
}

export function buildVerificationMessage(
  to: string,
  vars: VerificationEmailVars,
  idempotencyKey?: string
): EmailMessage {
  const verificationUrl = buildTokenUrl("/verify-email", vars.token);
  const rendered = renderEmailTemplate("verification", {
    ...vars,
    verificationUrl,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Verify your email address",
    html: rendered.html,
    text: rendered.text,
    templateId: "EMAIL_VERIFICATION_REQUESTED",
    relatedEntityType: "Trader",
    relatedEntityId: vars.email,
    idempotencyKey,
  };
}

export { renderEmailTemplate as renderVerificationTemplate };
