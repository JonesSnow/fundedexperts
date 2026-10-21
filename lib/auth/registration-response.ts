export const REGISTRATION_ACCEPTED_MESSAGE =
  "If this address can be registered, check your inbox for verification instructions. If you already have an account, sign in or reset your password.";

export function registrationAcceptedPayload(email: string) {
  return {
    accepted: true,
    email,
    message: REGISTRATION_ACCEPTED_MESSAGE,
  } as const;
}
