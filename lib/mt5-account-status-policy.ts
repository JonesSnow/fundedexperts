export type Mt5AccountStatus = "AVAILABLE" | "IN_USE" | "INACTIVE" | "MAINTENANCE";

export type Mt5AccountStatusDecision =
  | { kind: "allowed" }
  | { kind: "assignment-conflict"; message: string }
  | { kind: "invalid-transition"; from: Mt5AccountStatus };

const VALID_TRANSITIONS: Record<Mt5AccountStatus, readonly Mt5AccountStatus[]> = {
  AVAILABLE: ["IN_USE", "INACTIVE", "MAINTENANCE"],
  IN_USE: ["INACTIVE", "MAINTENANCE"],
  INACTIVE: ["AVAILABLE", "MAINTENANCE"],
  MAINTENANCE: ["AVAILABLE", "INACTIVE"],
};

export function evaluateMt5AccountStatusChange(
  from: Mt5AccountStatus,
  to: Mt5AccountStatus,
  hasActiveAssignment: boolean,
): Mt5AccountStatusDecision {
  if (to === "IN_USE" && !hasActiveAssignment) {
    return { kind: "assignment-conflict", message: "Cannot set IN_USE: no active assignment exists" };
  }
  if (to === "AVAILABLE" && hasActiveAssignment) {
    return { kind: "assignment-conflict", message: "Cannot set AVAILABLE: an active assignment exists." };
  }
  if (to !== from && !VALID_TRANSITIONS[from].includes(to)) {
    return { kind: "invalid-transition", from };
  }
  return { kind: "allowed" };
}
