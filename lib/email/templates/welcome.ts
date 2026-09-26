import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface WelcomeEmailVars {
  email: string;
  firstName?: string;
  isVerified: boolean;
}

export interface WelcomeEmailOptions {
  idempotencyKey?: string;
}

export function buildWelcomeMessage(
  to: string,
  vars: WelcomeEmailVars,
  options?: WelcomeEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("welcome", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
    verificationUrl: buildAppUrl("/verify-email"),
  });

  return {
    to,
    subject: "Welcome to Funded Experts",
    html: rendered.html,
    text: rendered.text,
    templateId: "WELCOME",
    relatedEntityId: vars.email,
    idempotencyKey: options?.idempotencyKey,
  };
}
