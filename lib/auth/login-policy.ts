export function invalidLoginResponse() {
  return {
    status: 401 as const,
    body: { success: false, error: "Invalid credentials" } as const,
  };
}
