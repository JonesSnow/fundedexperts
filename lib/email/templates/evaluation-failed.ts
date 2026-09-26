import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface EvaluationFailedEmailVars {
  email: string;
  firstName?: string;
  evaluationId: string;
  productName: string;
  failureReason?: string;
}

export interface EvaluationFailedEmailOptions {
  idempotencyKey?: string;
}

export function buildEvaluationFailedMessage(
  to: string,
  vars: EvaluationFailedEmailVars,
  options?: EvaluationFailedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("evaluation-failed", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Evaluation Update — Not Passed",
    html: rendered.html,
    text: rendered.text,
    templateId: "EVALUATION_FAILED",
    relatedEntityType: "Evaluation",
    relatedEntityId: vars.evaluationId,
    idempotencyKey: options?.idempotencyKey,
  };
}
