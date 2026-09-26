import { sendEmail } from "@/lib/email";
import { EmailMessage, EmailSendResult } from "@/lib/email/types";
import { generateIdempotencyKey } from "@/lib/email/idempotency";
import { createLogger } from "@/lib/logger";
import * as verificationTemplate from "@/lib/email/templates/verification";
import * as passwordResetTemplate from "@/lib/email/templates/password-reset";
import * as welcomeTemplate from "@/lib/email/templates/welcome";
import * as passwordChangedTemplate from "@/lib/email/templates/password-changed";
import * as orderCreatedTemplate from "@/lib/email/templates/order-created";
import * as paymentConfirmedTemplate from "@/lib/email/templates/payment-confirmed";
import * as paymentFailedTemplate from "@/lib/email/templates/payment-failed";
import * as evaluationStartedTemplate from "@/lib/email/templates/evaluation-started";
import * as evaluationPassedTemplate from "@/lib/email/templates/evaluation-passed";
import * as evaluationFailedTemplate from "@/lib/email/templates/evaluation-failed";
import * as accountAllocatedTemplate from "@/lib/email/templates/account-allocated";
import * as fundedAccountActivatedTemplate from "@/lib/email/templates/funded-account-activated";
import * as accountStatusChangedTemplate from "@/lib/email/templates/account-status-changed";
import * as ruleBreachTemplate from "@/lib/email/templates/rule-breach";
import * as payoutRequestedTemplate from "@/lib/email/templates/payout-requested";
import * as payoutApprovedTemplate from "@/lib/email/templates/payout-approved";
import * as payoutRejectedTemplate from "@/lib/email/templates/payout-rejected";
import * as systemAlertTemplate from "@/lib/email/templates/system-alert";
import { renderEmailTemplate } from "@/lib/email/renderer";
import { buildAppUrl } from "@/lib/email/urls";

const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

export interface TraderRef {
  id: string;
  email: string;
  firstName?: string;
}

export async function sendVerificationEmail(
  trader: TraderRef,
  token: string,
  expiresAt: Date,
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("verification", trader.id, token);
  const expires = expiresAt.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const message: EmailMessage = verificationTemplate.buildVerificationMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    token,
    expiresAt: expires,
  }, idempotencyKey);

  message.userId = trader.id;

  const result = await sendEmail(message);
  if (!result.success) {
    logger.error("EMAIL", "Verification email failed", {
      metadata: {
        template: "EMAIL_VERIFICATION_REQUESTED",
        recipientDomain: trader.email.split("@")[1],
        error: result.error,
      },
    });
  }
  return result;
}

export async function sendPasswordResetEmail(
  trader: TraderRef,
  token: string,
  expiresAt: Date,
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("password-reset", trader.id, token);
  const expires = expiresAt.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const message: EmailMessage = passwordResetTemplate.buildPasswordResetMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    token,
    expiresAt: expires,
  }, idempotencyKey);

  message.userId = trader.id;

  const result = await sendEmail(message);
  if (!result.success) {
    logger.error("EMAIL", "Password reset email failed", {
      metadata: {
        template: "PASSWORD_RESET_REQUESTED",
        recipientDomain: trader.email.split("@")[1],
        error: result.error,
      },
    });
  }
  return result;
}

export async function sendWelcomeEmail(
  trader: TraderRef,
  options?: { isVerified?: boolean },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("welcome", trader.id);

  const message: EmailMessage = welcomeTemplate.buildWelcomeMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    isVerified: options?.isVerified ?? false,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendPasswordChangedEmail(
  trader: TraderRef,
  options?: { changedByAdmin?: boolean },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("password-changed", trader.id);

  const message: EmailMessage = passwordChangedTemplate.buildPasswordChangedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    changedByAdmin: options?.changedByAdmin ?? false,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendLoginSecurityAlertEmail(
  trader: TraderRef,
  loginTime: string,
  ipAddress: string,
  options?: { location?: string; isNewDevice?: boolean },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("login-security", trader.id, loginTime, ipAddress);
  const rendered = renderEmailTemplate("login-security-alert", {
    email: trader.email,
    firstName: trader.firstName,
    loginTime,
    ipAddress,
    location: options?.location,
    isNewDevice: options?.isNewDevice ? "true" : "false",
    appUrl: buildAppUrl(""),
    dashboardUrl: buildAppUrl("/dashboard"),
  });

  const message: EmailMessage = {
    to: trader.email,
    subject: "Security Alert: New Login to Your Account",
    html: rendered.html,
    text: rendered.text,
    templateId: "LOGIN_SECURITY_ALERT",
    userId: trader.id,
    idempotencyKey,
  };

  const result = await sendEmail(message);
  return result;
}

export async function sendOrderCreatedEmail(
  trader: TraderRef,
  vars: {
    orderId: string;
    orderNumber: string;
    productName: string;
    totalAmount: number;
    currency: string;
    orderStatus: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("order-created", vars.orderId);

  const message: EmailMessage = orderCreatedTemplate.buildOrderCreatedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    orderId: vars.orderId,
    orderNumber: vars.orderNumber,
    productName: vars.productName,
    totalAmount: vars.totalAmount,
    currency: vars.currency,
    orderStatus: vars.orderStatus,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendPaymentConfirmedEmail(
  trader: TraderRef,
  vars: {
    orderId: string;
    orderNumber: string;
    totalAmount: number;
    currency: string;
    canActivate: boolean;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("payment-confirmed", vars.orderId);

  const message: EmailMessage = paymentConfirmedTemplate.buildPaymentConfirmedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    orderId: vars.orderId,
    orderNumber: vars.orderNumber,
    totalAmount: vars.totalAmount,
    currency: vars.currency,
    canActivate: vars.canActivate,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendPaymentFailedEmail(
  trader: TraderRef,
  vars: {
    orderId: string;
    orderNumber: string;
    totalAmount: number;
    currency: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("payment-failed", vars.orderId);

  const message: EmailMessage = paymentFailedTemplate.buildPaymentFailedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    orderId: vars.orderId,
    orderNumber: vars.orderNumber,
    totalAmount: vars.totalAmount,
    currency: vars.currency,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendEvaluationStartedEmail(
  trader: TraderRef,
  vars: {
    evaluationId: string;
    productName: string;
    accountSize: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("evaluation-started", vars.evaluationId);

  const message: EmailMessage = evaluationStartedTemplate.buildEvaluationStartedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    evaluationId: vars.evaluationId,
    productName: vars.productName,
    accountSize: vars.accountSize,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendEvaluationPassedEmail(
  trader: TraderRef,
  vars: {
    evaluationId: string;
    productName: string;
    totalPnl?: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("evaluation-passed", vars.evaluationId);

  const message: EmailMessage = evaluationPassedTemplate.buildEvaluationPassedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    evaluationId: vars.evaluationId,
    productName: vars.productName,
    totalPnl: vars.totalPnl,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendEvaluationFailedEmail(
  trader: TraderRef,
  vars: {
    evaluationId: string;
    productName: string;
    failureReason?: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("evaluation-failed", vars.evaluationId);

  const message: EmailMessage = evaluationFailedTemplate.buildEvaluationFailedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    evaluationId: vars.evaluationId,
    productName: vars.productName,
    failureReason: vars.failureReason,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendAccountAllocatedEmail(
  trader: TraderRef,
  vars: {
    evaluationId: string;
    accountNumber: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("account-allocated", vars.evaluationId, vars.accountNumber);

  const message: EmailMessage = accountAllocatedTemplate.buildAccountAllocatedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    evaluationId: vars.evaluationId,
    accountNumber: vars.accountNumber,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendFundedAccountActivatedEmail(
  trader: TraderRef,
  vars: {
    accountId: string;
    accountSize: string;
    status: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("funded-account-activated", vars.accountId);

  const message: EmailMessage = fundedAccountActivatedTemplate.buildFundedAccountActivatedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    accountId: vars.accountId,
    accountSize: vars.accountSize,
    status: vars.status,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendAccountStatusChangedEmail(
  trader: TraderRef,
  vars: {
    accountId: string;
    oldStatus: string;
    newStatus: string;
    reason?: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("account-status-changed", trader.id, vars.accountId, vars.newStatus);

  const message: EmailMessage = accountStatusChangedTemplate.buildAccountStatusChangedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    accountId: vars.accountId,
    oldStatus: vars.oldStatus,
    newStatus: vars.newStatus,
    reason: vars.reason,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendRuleBreachEmail(
  accountNumber: string,
  trader: TraderRef,
  vars: {
    violationType: string;
    detectedAt: string;
    currentStatus: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("rule-breach", accountNumber, vars.violationType, vars.detectedAt);

  const message: EmailMessage = ruleBreachTemplate.buildRuleBreachMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    violationType: vars.violationType,
    accountNumber,
    detectedAt: vars.detectedAt,
    currentStatus: vars.currentStatus,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendPayoutRequestedEmail(
  trader: TraderRef,
  vars: {
    requestId: string;
    amount: number;
    currency: string;
    status: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("payout-requested", vars.requestId);

  const message: EmailMessage = payoutRequestedTemplate.buildPayoutRequestedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    requestId: vars.requestId,
    amount: vars.amount,
    currency: vars.currency,
    status: vars.status,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendPayoutApprovedEmail(
  trader: TraderRef,
  vars: {
    requestId: string;
    amount: number;
    currency: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("payout-approved", vars.requestId);

  const message: EmailMessage = payoutApprovedTemplate.buildPayoutApprovedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    requestId: vars.requestId,
    amount: vars.amount,
    currency: vars.currency,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendPayoutRejectedEmail(
  trader: TraderRef,
  vars: {
    requestId: string;
    amount: number;
    currency: string;
    reason?: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("payout-rejected", vars.requestId);

  const message: EmailMessage = payoutRejectedTemplate.buildPayoutRejectedMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    requestId: vars.requestId,
    amount: vars.amount,
    currency: vars.currency,
    reason: vars.reason,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}

export async function sendSystemAlertEmail(
  trader: TraderRef,
  vars: {
    title: string;
    message: string;
    ctaText?: string;
    ctaUrl?: string;
    alertId: string;
  },
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey("system-alert", trader.id, vars.alertId);

  const message: EmailMessage = systemAlertTemplate.buildSystemAlertMessage(trader.email, {
    email: trader.email,
    firstName: trader.firstName,
    title: vars.title,
    message: vars.message,
    ctaText: vars.ctaText,
    ctaUrl: vars.ctaUrl,
  }, { idempotencyKey });

  message.userId = trader.id;

  const result = await sendEmail(message);
  return result;
}
