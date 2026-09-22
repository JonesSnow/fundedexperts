import {
  PrismaClient,
  Evaluation,
  MT5Account,
  AccountAssignment,
  LedgerEntry,
  LedgerEntryType,
  LedgerDirection,
  AuditAction,
  Order,
  OrderStatus,
} from "@prisma/client";
import type { LogActor, LogEntity, LogError } from "./logger";
import { allocateAccount } from "./allocation";
import { linkEvaluation } from "./evaluation-link";
import { PaymentProvider } from "./payment";
import { createLedgerEntry, CreateLedgerEntryInput } from "./ledger";
import { createLogger, generateCorrelationId } from "./logger";

const logger = createLogger({
  environment: process.env.NODE_ENV as "development" | "production" | "test",
});

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

function makeActor(id: string): LogActor {
  return { type: "trader", id };
}

function makeEntity(type: string, id?: string): LogEntity {
  return { type, id };
}

function makeError(code: string, message: string): LogError {
  return { code, message };
}

export async function activateEvaluation(
  prisma: PrismaClient,
  provider: PaymentProvider,
  input: ActivateEvaluationInput,
): Promise<ActivateEvaluationResult> {
  const correlationId = generateCorrelationId();
  const { orderId, performedBy, paymentReference } = input;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    logger.error("ACTIVATION", "Order not found", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Order", orderId),
      error: makeError("ORDER_NOT_FOUND", `Order ${orderId} not found`),
    });
    return {
      success: false,
      error: "Order not found",
      errorCategory: "NOT_FOUND",
      recoverable: false,
      correlationId,
    };
  }

  if (order.traderId !== performedBy) {
    logger.error("ACTIVATION", "Unauthorized: trader does not own order", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Order", orderId),
      error: makeError("FORBIDDEN", "Trader does not own this order"),
    });
    return {
      success: false,
      error: "Forbidden",
      errorCategory: "FORBIDDEN",
      recoverable: false,
      correlationId,
    };
  }

  if (order.status === OrderStatus.CANCELLED) {
    logger.error("ACTIVATION", "Cannot activate cancelled order", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Order", orderId),
      error: makeError("ORDER_CANCELLED", "Order is cancelled"),
    });
    return {
      success: false,
      error: "Order is cancelled",
      errorCategory: "ORDER_CANCELLED",
      recoverable: false,
      correlationId,
    };
  }

  if (paymentReference) {
    const paymentStatus = await provider.getPaymentStatus(paymentReference);
    if (paymentStatus !== "COMPLETED") {
      logger.error("ACTIVATION", "Payment not confirmed", {
        correlationId,
        actor: makeActor(performedBy),
        entity: makeEntity("Order", orderId),
        error: makeError(
          "PAYMENT_NOT_CONFIRMED",
          `Payment status: ${paymentStatus}`,
        ),
      });
      return {
        success: false,
        error: "Payment not confirmed",
        errorCategory: "PAYMENT_NOT_CONFIRMED",
        recoverable: true,
        correlationId,
      };
    }
  } else if (order.status !== OrderStatus.PAID) {
    logger.error("ACTIVATION", "Order not paid", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Order", orderId),
      error: makeError("ORDER_NOT_PAID", `Order status: ${order.status}`),
    });
    return {
      success: false,
      error: "Order is not paid",
      errorCategory: "ORDER_NOT_PAID",
      recoverable: false,
      correlationId,
    };
  }

  const rulesetVersionId = order.rulesetVersionId;

  if (!rulesetVersionId) {
    logger.error("ACTIVATION", "No ruleset version available", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Order", orderId),
      error: makeError("NO_RULESET", "No ruleset version for this order"),
    });
    return {
      success: false,
      error: "No ruleset version available",
      errorCategory: "NO_RULESET",
      recoverable: false,
      correlationId,
    };
  }

  let evaluation: Evaluation;
  let wasAlreadyActivated = false;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.evaluation.findFirst({
        where: {
          traderId: order.traderId,
          rulesetVersionId,
          status: { in: ["IN_PROGRESS", "PASSED", "FAILED"] },
        },
      });

      if (existing && existing.accountId) {
        return { evaluation: existing, created: false };
      }

      const created = await tx.evaluation.create({
        data: {
          traderId: order.traderId,
          rulesetVersionId,
          status: "IN_PROGRESS",
        },
      });

      await tx.auditLog.create({
        data: {
          action: "EVALUATION_STARTED" as AuditAction,
          entityType: "Evaluation",
          entityId: created.id,
          performedBy,
          details: { orderId: order.id, rulesetVersionId },
        },
      });

      return { evaluation: created, created: true };
    });

    evaluation = result.evaluation;
    wasAlreadyActivated =
      !result.created && result.evaluation.accountId !== null;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    logger.error("ACTIVATION", "Failed to create evaluation", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Order", orderId),
      error: makeError("EVALUATION_CREATE_FAILED", errorMsg),
    });
    return {
      success: false,
      error: "Failed to create evaluation",
      errorCategory: "EVALUATION_CREATE_FAILED",
      recoverable: true,
      correlationId,
    };
  }

  if (wasAlreadyActivated) {
    logger.info("ACTIVATION", "Evaluation already activated", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Evaluation", evaluation.id),
    });
    return {
      success: true,
      evaluation,
      wasAlreadyActivated,
      correlationId,
    } as ActivateEvaluationSuccess;
  }

  const allocationResult = await allocateAccount(prisma, {
    traderId: order.traderId,
  });
  if (!allocationResult.success) {
    logger.error("ACTIVATION", "Account allocation failed", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Evaluation", evaluation.id),
      error: makeError("ALLOCATION_FAILED", allocationResult.error),
    });
    return {
      success: false,
      error: `Account allocation failed: ${allocationResult.error}`,
      errorCategory: "ALLOCATION_FAILED",
      recoverable: true,
      correlationId,
    } as ActivateEvaluationFailure;
  }

  const linkResult = await linkEvaluation(prisma, {
    evaluationId: evaluation.id,
    accountId: allocationResult.account.id,
    performedBy,
  });

  if (!linkResult.success) {
    logger.error("ACTIVATION", "Evaluation linking failed", {
      correlationId,
      actor: makeActor(performedBy),
      entity: makeEntity("Evaluation", evaluation.id),
      error: makeError("LINK_FAILED", linkResult.error),
    });
    return {
      success: false,
      error: `Evaluation linking failed: ${linkResult.error}`,
      errorCategory: "LINK_FAILED",
      recoverable: linkResult.failureCategory === "TRANSACTION_ERROR",
      correlationId,
    } as ActivateEvaluationFailure;
  }

  let ledgerEntry: LedgerEntry | undefined;
  if (paymentReference) {
    const ledgerResult = await createLedgerEntry(prisma, {
      referenceId: `payment-${orderId}`,
      entryType: LedgerEntryType.CUSTOMER_PAYMENT,
      amount: order.totalAmount.toNumber(),
      direction: LedgerDirection.CREDIT,
      currency: order.currency,
      traderId: order.traderId,
      orderId: order.id,
      createdBy: performedBy,
    } as CreateLedgerEntryInput);

    if (ledgerResult.success) {
      ledgerEntry = ledgerResult.entry;
    } else {
      logger.warn("ACTIVATION", "Ledger entry creation failed", {
        correlationId,
        actor: makeActor(performedBy),
        entity: makeEntity("Order", orderId),
      });
    }
  }

  logger.info("ACTIVATION", "Evaluation activated successfully", {
    correlationId,
    actor: makeActor(performedBy),
    entity: makeEntity("Evaluation", evaluation.id),
    metadata: { accountId: allocationResult.account.id, wasAlreadyActivated },
  });

  return {
    success: true,
    evaluation,
    account: allocationResult.account,
    assignment: allocationResult.assignment,
    ledgerEntry,
    wasAlreadyActivated,
    correlationId,
  } as ActivateEvaluationSuccess;
}
