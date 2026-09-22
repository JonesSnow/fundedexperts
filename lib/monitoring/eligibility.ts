export interface EligibilityReason {
  code: string;
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: EligibilityReason[];
}

export interface AccountEligibilityInput {
  accountId: string;
  status?: string;
  isDemo?: boolean;
  hasOpenPositions?: boolean;
  isSuspended?: boolean;
  leverage?: number;
}

interface BlockingCheck {
  code: string;
  message: string;
  check: (input: AccountEligibilityInput) => boolean;
}

interface NonBlockingCheck {
  code: string;
  message: string;
  severity: EligibilityReason["severity"];
  check: (input: AccountEligibilityInput) => boolean;
}

const BLOCKING_CHECKS: BlockingCheck[] = [
  {
    code: "ACCOUNT_SUSPENDED",
    message: "Account is suspended and cannot be monitored",
    check: (input) => input.isSuspended === true,
  },
  {
    code: "DEMO_ACCOUNT",
    message: "Demo accounts are not eligible for live monitoring",
    check: (input) => input.isDemo === true,
  },
  {
    code: "ACCOUNT_INACTIVE",
    message: "Account is not active",
    check: (input) => input.status !== undefined && input.status !== "ACTIVE",
  },
];

const NON_BLOCKING_CHECKS: NonBlockingCheck[] = [
  {
    code: "OPEN_POSITIONS",
    message: "Account has open positions that may affect monitoring",
    severity: "MEDIUM",
    check: (input) => input.hasOpenPositions === true,
  },
  {
    code: "HIGH_LEVERAGE",
    message: "Account leverage exceeds recommended threshold",
    severity: "LOW",
    check: (input) => (input.leverage ?? 0) > 100,
  },
];

export function evaluateEligibility(input: AccountEligibilityInput): EligibilityResult {
  const reasons: EligibilityReason[] = [];

  for (const check of BLOCKING_CHECKS) {
    if (check.check(input)) {
      reasons.push({ code: check.code, message: check.message, severity: "HIGH" });
    }
  }

  for (const check of NON_BLOCKING_CHECKS) {
    if (check.check(input)) {
      reasons.push({ code: check.code, message: check.message, severity: check.severity });
    }
  }

  const blockingCount = reasons.filter(
    (r) => BLOCKING_CHECKS.some((bc) => bc.code === r.code)
  ).length;
  const eligible = blockingCount === 0;

  return { eligible, reasons };
}

export function isBlockingReason(reason: EligibilityReason): boolean {
  return BLOCKING_CHECKS.some((bc) => bc.code === reason.code);
}
