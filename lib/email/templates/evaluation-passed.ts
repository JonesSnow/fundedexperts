import { EmailMessage } from "../types";
import { renderEmailTemplate } from "../renderer";
import { buildAppUrl } from "../urls";

export interface EvaluationPassedEmailVars {
  email: string;
  firstName?: string;
  evaluationId: string;
  productName: string;
  totalPnl?: string;
}

export interface EvaluationPassedEmailOptions {
  idempotencyKey?: string;
}

export function buildEvaluationPassedMessage(
  to: string,
  vars: EvaluationPassedEmailVars,
  options?: EvaluationPassedEmailOptions
): EmailMessage {
  const rendered = renderEmailTemplate("evaluation-passed", {
    ...vars,
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  return {
    to,
    subject: "Congratulations! Your evaluation passed",
    html: rendered.html,
    text: rendered.text,
    templateId: "EVALUATION_PASSED",
    relatedEntityType: "Evaluation",
    relatedEntityId: vars.evaluationId,
    idempotencyKey: options?.idempotencyKey,
  };
}
