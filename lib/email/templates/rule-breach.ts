import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface RuleBreachEmailVars {
  email: string;
  firstName?: string;
  violationType: string;
  accountNumber: string;
  detectedAt: string;
  currentStatus: string;
}

export interface RuleBreachEmailOptions {
  idempotencyKey?: string;
}

export function buildRuleBreachMessage(
  to: string,
  vars: RuleBreachEmailVars,
  options?: RuleBreachEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("rule-breach", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Rule Breach Notification",
    html: rendered.html,
    text: rendered.text,
    templateId: "RULE_BREACH_CONFIRMED",
    relatedEntityType: "MT5Account",
    relatedEntityId: vars.accountNumber,
    idempotencyKey: options?.idempotencyKey,
  };
}
