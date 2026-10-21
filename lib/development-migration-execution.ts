/** Run a migration only after the connected development target was verified. */
export async function runAfterVerifiedDevelopmentTarget(
  verifyTarget: () => Promise<void>,
  applyMigrations: () => void,
): Promise<void> {
  await verifyTarget();
  applyMigrations();
}
