import type { PaymentProvider, PaymentProviderName } from "./payment";
import { createMockPaymentProvider } from "./mock-payment-provider";
import { isNowPaymentsEnabled, NowPaymentsProvider } from "./nowpayments-provider";

/**
 * Provider registry. Only MOCK is available until a real provider is configured.
 * To add a provider:
 * 1. Implement the PaymentProvider interface (including verifyWebhookSignature)
 * 2. Register it here with a factory function
 * 3. Set the PAYMENT_PROVIDER environment variable
 *
 * The mock provider is test-only. It is never activated in production or
 * development. When no real provider is configured, callers fail closed
 * (no payment initiation, no webhook acceptance).
 */
const providers = new Map<PaymentProviderName, () => PaymentProvider>();
let nowPaymentsProvider: NowPaymentsProvider | null = null;

// Register mock provider (test-only)
providers.set("MOCK", () => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Mock payment provider is available only in tests");
  }
  return createMockPaymentProvider();
});
providers.set("NOWPAYMENTS", () => {
  if (!isNowPaymentsEnabled()) {
    throw new Error("NOWPayments is disabled until merchant approval and live configuration are verified");
  }
  if (!nowPaymentsProvider) nowPaymentsProvider = new NowPaymentsProvider();
  return nowPaymentsProvider;
});

export function getPaymentProvider(name: PaymentProviderName): PaymentProvider {
  const factory = providers.get(name);
  if (!factory) {
    throw new Error(`Unknown payment provider: ${name}`);
  }
  return factory();
}

export function getAvailableProviders(): PaymentProviderName[] {
  return Array.from(providers.keys());
}

/**
 * Whether the given provider name is a real (non-mock) provider. Only MOCK is
 * registered today, so no name is real yet. Return false for MOCK so the
 * application never activates the mock outside tests.
 */
export function isRealProvider(name?: PaymentProviderName): boolean {
  return name === "NOWPAYMENTS" && isNowPaymentsEnabled();
}

/**
 * Get the configured provider name from environment.
 * Returns null if no provider is configured, or if the only configured
 * provider is the mock outside the test environment (fail closed).
 */
export function getConfiguredProviderName(): PaymentProviderName | null {
  const envProvider = process.env.PAYMENT_PROVIDER?.trim().toUpperCase();
  if (!envProvider) return null;
  if (!providers.has(envProvider as PaymentProviderName)) return null;
  const name = envProvider as PaymentProviderName;
  if (!isRealProvider(name)) {
    // The mock provider is never activated outside tests.
    if (name === "MOCK" && process.env.NODE_ENV === "test") return name;
    return null;
  }
  return name;
}
