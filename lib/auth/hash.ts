import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * A bcrypt hash at the same cost factor used for real passwords, used to keep
 * the "no such user" and "wrong password" paths doing comparable work.
 *
 * This is the hash of a random throwaway string generated once for this file.
 * It is not a secret: the comparison result is discarded, and the preimage is
 * random data that no password can match. It must never be replaced with a real
 * user's hash or with the hash of a guessable value.
 *
 * bcrypt hashes are salted, so the exact digest is not portable across
 * environments. If this constant is ever regenerated it must still be a
 * cost-12 hash, otherwise the timing it is meant to equalise changes.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$12$101hWk0CBu.DGJc/.lTRK.0Pk8bTtcZpWDzOhSM3MP803W1pgYUH2";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Perform a password verification whose result is intentionally ignored.
 *
 * Call this before returning an authentication failure that was decided without
 * consulting a stored hash (unknown email, suspended account). Without it the
 * unknown-email path returns immediately while the wrong-password path spends a
 * full bcrypt round, and the difference is a reliable account-enumeration
 * oracle.
 *
 * The boolean is deliberately not returned so callers cannot accidentally treat
 * it as an authentication decision.
 */
export async function performDummyPasswordVerification(
  password: string
): Promise<void> {
  try {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
  } catch {
    // A malformed candidate password must never change the control flow here.
  }
}