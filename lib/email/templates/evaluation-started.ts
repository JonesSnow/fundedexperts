import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface EvaluationStartedEmailVars {
  email: string;
  firstName?: string;
  evaluationId: string;
  productName: string;
  accountSize: string;
}

export interface EvaluationStartedEmailOptions {
  idempotencyKey?: string;
}

export function buildEvaluationStartedMessage(
  to: string,
  vars: EvaluationStartedEmailVars,
  options?: EvaluationStartedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("evaluation-started", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Evaluation Started",
    html: rendered.html,
    text: rendered.text,
    templateId: "EVALUATION_STARTED",
    relatedEntityType: "Evaluation",
    relatedEntityId: vars.evaluationId,
    idempotencyKey: options?.idempotencyKey,
  };
}
