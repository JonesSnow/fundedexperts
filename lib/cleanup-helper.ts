import { PrismaClient } from "@prisma/client";

export interface CleanupStepResult {
  label: string;
  success: boolean;
  error?: string;
}

export interface CleanupResult {
  succeeded: boolean;
  total: number;
  passed: number;
  failed: number;
  steps: CleanupStepResult[];
}

export function createCleanupResult(): CleanupResult {
  return {
    succeeded: true,
    total: 0,
    passed: 0,
    failed: 0,
    steps: [],
  };
}

export async function runCleanupSteps(
  prisma: PrismaClient,
  steps: Array<{ label: string; fn: () => Promise<unknown> }>
): Promise<CleanupResult> {
  const result = createCleanupResult();
  for (const step of steps) {
    result.total++;
    try {
      await step.fn();
      result.passed++;
      result.steps.push({ label: step.label, success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.failed++;
      result.succeeded = false;
      result.steps.push({ label: step.label, success: false, error: msg });
      console.warn(`[cleanup] FAILED ${step.label}: ${msg}`);
    }
  }
  if (result.failed > 0) {
    console.warn(`[cleanup] ${result.failed}/${result.total} cleanup operation(s) failed`);
  } else {
    console.log(`[cleanup] All ${result.total} operations succeeded`);
  }
  return result;
}

export function assertCleanup(result: CleanupResult, context: string = ""): void {
  if (!result.succeeded) {
    const failedSteps = result.steps.filter((s) => !s.success);
    const detail = failedSteps.map((s) => `${s.label}: ${s.error}`).join("; ");
    throw new Error(
      `CLEANUP FAILURE${context ? ` in ${context}` : ""}: ${result.failed}/${result.total} operations failed — ${detail}`
    );
  }
}
