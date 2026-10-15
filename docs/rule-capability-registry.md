# Rule Capability Registry

The registry in `lib/rule-capabilities.ts` is the single source of truth for
which required rules may appear in published offers and which calculation
methods the monitoring pipeline may enforce. Product publication, public
catalog filtering, order-term resolution, paid-order activation, and runtime
evaluation all use this registry. No caller can pass an ad hoc list of
“verified” rule types.

## Current capabilities

| Rule type | Readiness | Published calculation | Evidence and limits |
|---|---|---|---|
| `MAX_LEVERAGE` | Supported | `SNAPSHOT_ACCOUNT_LEVERAGE`, breach only when `actual > maximum` | Reads the provider account leverage value; stale/missing values remain unavailable. Depends on a fresh provider snapshot. |
| `MAX_OPEN_TRADES` | Supported | `COUNT_OPEN_POSITIONS_AND_PENDING_ORDERS`, breach only when `actual > maximum` | Requires both provider arrays and known MT5 order states. Counts positions and in-flight/open pending orders; unknown order states make the outcome unavailable. |
| `DRAWDOWN_LIMIT` | Limited | `STATIC_STARTING_EQUITY` only | Uses the evaluation starting balance and fresh current equity. Trailing-peak drawdown is blocked because the current live adapter does not provide a verified complete equity history. |
| `PROFIT_TARGET` | Unsupported | None | The live history path does not prove complete history and sums deal profit without commission and swap costs. |
| `MAX_DAILY_LOSS` | Unsupported | None | The live adapter does not supply PnL components tied to a verified daily reset period. |
| `MIN_TRADES` | Unsupported | None | The live adapter does not supply complete, uniquely identified trade events. |
| `MIN_TRADING_DAYS` | Unsupported | None | The live adapter does not supply complete, uniquely identified events for timezone-based day counting. |
| `TRADING_HOURS` | Unsupported | None | A complete live activity-event window is not available to verify every trade timestamp. |
| `TRADING_SESSION` | Unsupported | None | The current evaluator only checks allowed symbols and the live adapter does not provide complete activity events; this does not establish general session enforcement. |

“Supported” describes deterministic implementation behavior when all required
provider fields are present and fresh. It does not confirm a live broker
connection or production monitoring health. Missing, stale, or unknown data
must remain unavailable and must not become a pass. Required unsupported rules
block publication. An optional unsupported rule can be published only without
an active threshold or calculation; the catalog labels it “Not enforced” and
returns the registry's reason so it cannot be mistaken for a trading control.
The rules center also returns the enforcement status and limitation text with
each displayed rule.

## Change policy

Enable a rule only after its provider fields, completeness guarantees,
freshness behavior, thresholds, boundary comparisons, and missing-data behavior
are represented in the registry and covered by isolated calculation,
publication, and runtime tests. Changes to required customer-facing terms also
need product approval. A test fixture alone is not evidence that a live rule is
supported.
