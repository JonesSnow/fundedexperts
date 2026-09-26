import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface SystemAlertEmailVars {
  email: string;
  firstName?: string;
  title: string;
  message: string;
  ctaText?: string;
  ctaUrl?: string;
}

export interface SystemAlertEmailOptions {
  idempotencyKey?: string;
}

export function buildSystemAlertMessage(
  to: string,
  vars: SystemAlertEmailVars,
  options?: SystemAlertEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("system-alert", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: vars.ctaUrl ?? buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: vars.title || "System Alert",
    html: rendered.html,
    text: rendered.text,
    templateId: "SYSTEM_ALERT",
    relatedEntityType: "System",
    idempotencyKey: options?.idempotencyKey,
  };
}
