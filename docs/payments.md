# Crypto Payments: Current Technical Status

**Status:** Checkout is intentionally unavailable. The production integration has not been selected or verified.

The owner-supplied master specification requires crypto-only settlement, independent transfer verification, confirmation handling, replay-safe processing, transaction deduplication, reconciliation and auditable order-state changes. It explicitly leaves the provider, supported assets/networks, confirmation thresholds, expiry policy, fees and refunds unresolved. Those terms must not be guessed or published.

## Implemented safe boundary

`lib/crypto-payment-verification.ts` is a pure classifier for a server-side provider or chain-adapter observation. It compares the order association, canonical network, asset, destination and exact asset-native amount; applies an explicitly supplied expiry boundary; rejects dropped/reorganized observations; and returns `CONFIRMING` until both trusted status and the configured confirmation threshold are met. Amounts use integer atomic units to avoid floating-point comparison.

The payment abstraction currently has no production provider identifier. Its only provider is the in-memory `MOCK`, which is restricted to `NODE_ENV=test` and throws if constructed in development, production, or an unset environment. Static inspection found no application import of that mock. A concrete crypto provider must be selected and implemented before checkout can be enabled.

A `CONFIRMED` classifier result is not, by itself, permission to mark an order paid. A future persistence workflow must independently authenticate the provider/chain observation, enforce unique transaction consumption, deduplicate provider events, atomically persist payment and order transitions, and retain reconciliation evidence. This repository change does not add a provider, wallet, webhook, database model or payment endpoint behavior.

## Required before checkout can be enabled

- Select and verify a provider or operate a reviewed chain-monitoring service.
- Approve assets, networks, quote/conversion rules, fees, confirmation threshold, expiry boundary, and underpayment/overpayment/late-payment/refund policies.
- Add durable payment intent and event records with unique provider-event and transaction-consumption constraints, plus atomic idempotent state transitions.
- Verify signed event handling or trusted chain reads, replay prevention, retries, provider outage handling, reconciliation, admin review and customer notifications.
- Validate the complete flow using a verified isolated sandbox and test database before considering a production configuration.

Until then, order creation and `/api/orders/[id]/pay` remain fail-closed. Do not interpret the in-memory mock provider or these database-free tests as evidence of a live payment integration.
