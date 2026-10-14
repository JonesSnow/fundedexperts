import { NextResponse } from "next/server";
import { activatePaidOrder, type ActivationRepository, type ActivationResult } from "./evaluation-activation";
import type { ProductRuleType } from "./product-domain";

export function evaluationActivationResponse(result: ActivationResult): NextResponse {
  if (!result.success) {
    const status = result.code === "ORDER_NOT_FOUND" ? 404
      : result.code === "FORBIDDEN" ? 403
        : result.code === "ORDER_NOT_PAID" ? 400
          : result.code === "NO_MATCHING_INVENTORY" || result.code === "ACTIVE_ASSIGNMENT_EXISTS" || result.code === "TERMS_REVIEW_REQUIRED" || result.code === "ACTIVATION_CONFLICT" ? 409
            : 500;
    return NextResponse.json({ success: false, error: result.error, code: result.code, ...(result.reviewRequired ? { reviewRequired: true } : {}) }, { status });
  }
  return NextResponse.json({
    success: true,
    evaluation: {
      id: result.evaluation.id,
      status: result.evaluation.status,
      startedAt: result.evaluation.startedAt,
      rulesetVersionId: result.evaluation.rulesetVersionId,
      account: {
        id: result.account.id,
        accountNumber: result.account.accountNumber,
        accountSize: result.account.accountSize,
        currency: result.account.currency,
        purpose: result.account.purpose,
        status: result.account.status,
      },
      assignment: {
        id: result.assignment.id,
        status: result.assignment.status,
        assignedAt: result.assignment.assignedAt,
      },
      duplicate: result.duplicate,
    },
  }, { status: result.duplicate ? 200 : 201 });
}

export async function handlePaidOrderActivation(
  repository: ActivationRepository,
  input: { orderId: string; traderId: string | null },
  evaluatorVerifiedRuleTypes: readonly ProductRuleType[] = [],
): Promise<NextResponse> {
  if (!input.traderId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const result = await activatePaidOrder(repository, { orderId: input.orderId, traderId: input.traderId }, evaluatorVerifiedRuleTypes);
  return evaluationActivationResponse(result);
}
