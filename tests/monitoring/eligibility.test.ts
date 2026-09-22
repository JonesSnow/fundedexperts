import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateEligibility, isBlockingReason, type EligibilityReason } from "../../lib/monitoring/eligibility";

describe("evaluateEligibility", () => {
  describe("eligible accounts", () => {
    it("accepts active live account with no issues", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "ACTIVE",
        isDemo: false,
        isSuspended: false,
      });
      assert.strictEqual(result.eligible, true);
      assert.strictEqual(result.reasons.length, 0);
    });

    it("accepts active account with open positions (non-blocking)", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "ACTIVE",
        isDemo: false,
        isSuspended: false,
        hasOpenPositions: true,
      });
      assert.strictEqual(result.eligible, true);
      assert.strictEqual(result.reasons.length, 1);
      assert.strictEqual(result.reasons[0].code, "OPEN_POSITIONS");
    });

    it("accepts live account with low leverage", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "ACTIVE",
        isDemo: false,
        isSuspended: false,
        leverage: 50,
      });
      assert.strictEqual(result.eligible, true);
    });
  });

  describe("blocking reasons", () => {
    it("rejects suspended account", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "ACTIVE",
        isDemo: false,
        isSuspended: true,
      });
      assert.strictEqual(result.eligible, false);
      assert.ok(result.reasons.some((r) => r.code === "ACCOUNT_SUSPENDED"));
    });

    it("rejects demo account", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "ACTIVE",
        isDemo: true,
        isSuspended: false,
      });
      assert.strictEqual(result.eligible, false);
      assert.ok(result.reasons.some((r) => r.code === "DEMO_ACCOUNT"));
    });

    it("rejects inactive account", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "INACTIVE",
        isDemo: false,
        isSuspended: false,
      });
      assert.strictEqual(result.eligible, false);
      assert.ok(result.reasons.some((r) => r.code === "ACCOUNT_INACTIVE"));
    });

    it("rejects account with multiple blocking reasons", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "INACTIVE",
        isDemo: true,
        isSuspended: true,
      });
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.reasons.filter((r) => isBlockingReason(r)).length, 3);
    });
  });

  describe("non-blocking reasons severity", () => {
    it("OPEN_POSITIONS has MEDIUM severity", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "ACTIVE",
        isDemo: false,
        isSuspended: false,
        hasOpenPositions: true,
      });
      const reason = result.reasons.find((r) => r.code === "OPEN_POSITIONS") as EligibilityReason;
      assert.strictEqual(reason.severity, "MEDIUM");
    });

    it("HIGH_LEVERAGE has LOW severity", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "ACTIVE",
        isDemo: false,
        isSuspended: false,
        leverage: 200,
      });
      const reason = result.reasons.find((r) => r.code === "HIGH_LEVERAGE") as EligibilityReason;
      assert.strictEqual(reason.severity, "LOW");
    });
  });

  describe("edge cases", () => {
    it("leverage defaults to 0 when undefined", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "ACTIVE",
        isDemo: false,
        isSuspended: false,
      });
      assert.strictEqual(result.eligible, true);
    });

    it("empty reasons for fully eligible account", () => {
      const result = evaluateEligibility({
        accountId: "acc-1",
        status: "ACTIVE",
        isDemo: false,
        isSuspended: false,
      });
      assert.deepStrictEqual(result.reasons, []);
    });
  });
});

describe("isBlockingReason", () => {
  it("returns true for ACCOUNT_SUSPENDED", () => {
    const reason: EligibilityReason = { code: "ACCOUNT_SUSPENDED", message: "suspended", severity: "HIGH" };
    assert.strictEqual(isBlockingReason(reason), true);
  });

  it("returns true for DEMO_ACCOUNT", () => {
    const reason: EligibilityReason = { code: "DEMO_ACCOUNT", message: "demo", severity: "HIGH" };
    assert.strictEqual(isBlockingReason(reason), true);
  });

  it("returns true for ACCOUNT_INACTIVE", () => {
    const reason: EligibilityReason = { code: "ACCOUNT_INACTIVE", message: "inactive", severity: "HIGH" };
    assert.strictEqual(isBlockingReason(reason), true);
  });

  it("returns false for OPEN_POSITIONS", () => {
    const reason: EligibilityReason = { code: "OPEN_POSITIONS", message: "positions", severity: "MEDIUM" };
    assert.strictEqual(isBlockingReason(reason), false);
  });

  it("returns false for HIGH_LEVERAGE", () => {
    const reason: EligibilityReason = { code: "HIGH_LEVERAGE", message: "leverage", severity: "LOW" };
    assert.strictEqual(isBlockingReason(reason), false);
  });
});
