export interface CleanupAuthorizationEnvironment {
  [key: string]: string | undefined;
  TEST_DATABASE_CLEANUP_CONFIRMATION?: string | undefined;
}

export const TEST_DATABASE_CLEANUP_CONFIRMATION_VALUE =
  "I_UNDERSTAND_THIS_DELETES_ALL_DATA_IN_THE_TEST_DATABASE";

/** Require separate, process-level approval before legacy suites run global cleanup. */
export function assertTestDatabaseCleanupAuthorized(
  env: CleanupAuthorizationEnvironment,
): void {
  if (env.TEST_DATABASE_CLEANUP_CONFIRMATION !== TEST_DATABASE_CLEANUP_CONFIRMATION_VALUE) {
    throw new Error(
      "Refusing destructive test cleanup: set TEST_DATABASE_CLEANUP_CONFIRMATION in the invoking process after verifying the disposable test target."
    );
  }
}
