/** Ensures every configured rule has exactly one initial evaluation record. */
export function isRuleInitializationComplete(
  configuredRuleIds: readonly string[],
  initializedRuleIds: readonly string[],
): boolean {
  if (configuredRuleIds.length === 0 || configuredRuleIds.length !== initializedRuleIds.length) return false;
  if (new Set(configuredRuleIds).size !== configuredRuleIds.length || new Set(initializedRuleIds).size !== initializedRuleIds.length) return false;
  const configured = [...configuredRuleIds].sort();
  const initialized = [...initializedRuleIds].sort();
  return configured.every((id, index) => id === initialized[index]);
}
