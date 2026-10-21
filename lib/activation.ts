import type {
  PrismaClient,
  Evaluation,
  MT5Account,
  AccountAssignment,
  LedgerEntry,
} from "@prisma/client";
import type { PaymentProvider } from "./payment";
import { generateCorrelationId } from "./logger";

export interface ActivateEvaluationInput {
  orderId: string;
  performedBy: string;
  paymentReference?: string;
}

export interface ActivateEvaluationSuccess {
  success: true;
  evaluation: Evaluation;
  account?: MT5Account;
  assignment?: AccountAssignment;
  ledgerEntry?: LedgerEntry;
  wasAlreadyActivated: boolean;
  correlationId: string;
}

export interface ActivateEvaluationFailure {
  success: false;
  error: string;
  errorCategory: string;
  recoverable: boolean;
  correlationId: string;
}

export type ActivateEvaluationResult =
  ActivateEvaluationSuccess | ActivateEvaluationFailure;

export async function activateEvaluation(
  prisma: PrismaClient,
  provider: PaymentProvider,
  input: ActivateEvaluationInput,
): Promise<ActivateEvaluationResult> {
  const correlationId = generateCorrelationId();
  // Retired legacy flow: it predates immutable purchased-term validation and
  // the transactional, exact-inventory activation service. Keep this export
  // fail-closed so a future caller cannot accidentally restore that bypass.
  void prisma;
  void provider;
  void input;
  return {
    success: false,
    error: "Legacy activation is disabled. Use the verified paid-order activation flow.",
    errorCategory: "LEGACY_ACTIVATION_DISABLED",
    recoverable: false,
    correlationId,
  };
}
