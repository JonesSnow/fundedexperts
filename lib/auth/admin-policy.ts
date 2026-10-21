/** A role claim grants administrative access only while the database status is ACTIVE. */
export function isActiveAdministrator(
  actor: { role?: unknown; status?: unknown } | null | undefined,
): boolean {
  return actor?.role === "ADMIN" && actor.status === "ACTIVE";
}
