# MT5/XM Connectivity Investigation (Updated)

**Status:** BLOCKED — Terminal Not Logged In
**Investigation Date:** 2026-09-20
**Status per Architecture Doc:** PARTIALLY VERIFIED — Read-only monitoring feasible via terminal bridge
**Classification:** PARTIALLY VERIFIED — Terminal bridge feasible in principle; no successful connection established

## Evidence Summary

Based on extensive web research (see original investigation) AND direct local environment testing.

### Key Research Sources

| Source | URL | Key Finding |
|---|---|---|
| XM Trading API (Philippines) | tradeinphilippines.com/api | XM does not publish a standalone REST/WebSocket API |
| XM MT5 Platform Developer | builtin.com/jobs | XM promotes MT5 EA and MQL5 support |
| UMA Technology | umatechnology.org | XM retail materials do not publish third-party mobile API |
| ForexTradeLab | forextradelab.com | No public XM retail REST/FIX/Python order API established |
| MetaQuotes Brokers | metatrader5.com/brokers | MT5 provides Broker APIs (Manager, Web, Server) for licensed institutions |
| Brokeret MT5 API | docs.brokeret.com | Third-party MT5 Manager API wrapper (not XM-specific) |
| mt5-httpapi GitHub | github.com/psyb0t/mt5-httpapi | MT5 running in Windows VM with REST API (community project) |
| MT5 Manager API (zhawa) | github.com/zhawasolutions | PHP SDK for MT5 Manager API (broker-agnostic) |
| MetaTrader API Cloud | metatraderapi.cloud | Generic MT5 REST API (not broker-specific) |
| essamamdani/xm-exness | github.com/essamamdani | Docker image running MT5 with REST API for XM/Exness |
| mt5-bridge (akivajp) | github.com/akivajp/mt5-bridge | FastAPI bridge for MT5 terminal on Windows |

## Investigated Methods

### Method 1: XM Public REST API
**Status:** NOT AVAILABLE for retail clients
- XM does not publish a standalone REST or WebSocket API for external client applications
- XM's automation paths are: (1) MT5 Expert Advisors in MQL5, (2) Custom API requiring credentials from Members Area (undocumented publicly)

### Method 2: MT5 Expert Advisors (MQL5)
**Status:** VERIFIED AVAILABLE for XM accounts
- XM officially confirms MT5 EA support and MQL5 help
- EAs run inside MT5 terminal, coded in MQL5
- Requires MT5 terminal running with account logged in

### Method 3: MetaTrader5 Python Package (Terminal Bridge)
**Status:** VERIFIED AVAILABLE — Package installed; connection UNAVAILABLE
- Official MetaQuotes package: `MetaTrader5` Python module v5.0.6180 (installed successfully)
- Communicates with a running MT5 terminal via IPC (interprocess communication)
- **Read access:** balance, equity, margin, free margin, positions, orders, history, symbols, quotes, tick data (per documentation)
- **Write access:** trade operations possible but requires broker permission and MT5 terminal running
- **Requires:** Windows MT5 terminal logged into an account
- **NOT XM-specific:** Works with any MT5 broker; requires running terminal per account

### Method 4: MetaQuotes Broker APIs (Institutional)
**Status:** NOT AVAILABLE for retail prop-firm use

### Method 5: Third-Party Hosted MT5 APIs
**Status:** NOT XM-SPECIFIC

### Method 6: Community Terminal Bridges
**Status:** UNVERIFIED for XM

## POC-Specific Findings (2026-09-20)

### Environment

| Component | Status | Details |
|---|---|---|
| Python 3.14.6 | AVAILABLE | Working Python installation |
| pip 26.1.2 | AVAILABLE | Package manager working |
| MetaTrader5 package v5.0.6180 | INSTALLED | `pip install MetaTrader5` succeeded |
| MT5 Terminal | INSTALLED | `D:\programs\MetaTrader 5\terminal64.exe` (PID 15504) |
| Terminal Logged In | NO | No history data, no auth files; `initialize()` hangs |
| XM Demo Account | NOT AVAILABLE | No credentials in environment |

### POC Results Summary

| Test | Result | Details |
|---|---|---|
| `mt5.initialize()` no creds | TIMEOUT | 10s timeout, terminal not authenticated |
| `mt5.initialize()` invalid creds | TIMEOUT | Same failure mode |
| `mt5.initialize()` env creds | SKIPPED | No MT5_LOGIN/MT5_PASSWORD/MT5_SERVER env vars |
| `mt5.terminal_info()` | None | No active connection |
| `mt5.account_info()` | None | No active connection |
| `mt5.shutdown()` | True | Idempotent, safe cleanup |
| Read operations | SKIPPED | No active connection |

**Direct test result: No XM demo connection was established. No data was retrieved.**

### Data Accessibility Table

| Data Item | Required Access Method | XM Support Status | Evidence | Uncertainty |
|---|---|---|---|---|
| Account balance | MT5 terminal bridge (Python) | NOT TESTED | Package docs say `account_info()` returns balance | Cannot verify without logged-in terminal |
| Equity | MT5 terminal bridge (Python) | NOT TESTED | Package docs say `account_info()` returns equity | Cannot verify without logged-in terminal |
| Free margin | MT5 terminal bridge (Python) | NOT TESTED | Package docs say `account_info()` returns margin_free | Cannot verify without logged-in terminal |
| Open positions | MT5 terminal bridge (Python) | NOT TESTED | Package docs say `positions_get()` | Cannot verify without logged-in terminal |
| Orders | MT5 terminal bridge (Python) | NOT TESTED | Package docs say `orders_get()` | Cannot verify without logged-in terminal |
| Trade history | MT5 terminal bridge (Python) | NOT TESTED | Package docs say `history_deals_get()` | Cannot verify without logged-in terminal |
| Account connection status | MT5 terminal bridge (Python) | NOT TESTED | `terminal_info()` returns data when connected | Cannot verify without logged-in terminal |
| Daily loss calculations | Derived | NOT TESTED | Requires historical data | Cannot verify |
| Overall loss calculations | Derived | NOT TESTED | Requires historical data | Cannot verify |
| Trading-day calculations | Derived | NOT TESTED | Requires server timezone + calendar | Cannot verify |

### Security Findings (POC-Specific)

| Risk | Impact | Mitigation | Status |
|---|---|---|---|
| Decrypted credentials in worker memory | High | Worker in isolated process, brief decryption window | DESIGN ONLY |
| Credential exposure via logs | Critical | Logging excludes credentials field | VERIFIED in code |
| Unauthorized API access | High | ADMIN role required, JWT validation | VERIFIED in code |
| POC script security | Low | No credentials used, login masking, subprocess isolation | VERIFIED |

## Feasibility Classification: BLOCKED — Cannot Verify

### What Was Previously Verified (Research-Based)
1. MetaTrader5 Python package exists and installs successfully
2. Read-only monitoring IS documented as feasible via terminal bridge
3. All 7 required data items CAN be read per package documentation
4. XM officially supports MT5 EAs (MQL5 automation)

### What Could NOT Be Verified
1. **Actual bridge connection** — `mt5.initialize()` hangs without logged-in terminal
2. **Data retrieval** — no data retrieved, no successful API calls
3. **Error behavior** — cannot distinguish terminal errors from network errors
4. **Response times** — no data retrieved, no latency measurements
5. **XM-specific behavior** — no XM connection tested

### Technical Blockers

| Blocker | Severity | Resolution |
|---|---|---|
| Terminal not logged in | Critical | Need XM demo credentials and manual terminal login |
| No XM demo credentials | Critical | Must obtain from XM Members Area |
| `mt5.initialize()` hangs | High | Requires authenticated terminal; cannot timeout gracefully |
| No admin rights | High | Cannot install new terminal if existing one unusable |
| No PostgreSQL | High | Separate blocker (see docs/test-environment.md) |

## Explicit Limitations

1. **No XM integration was tested** — only local terminal bridge was attempted
2. **The running terminal64.exe was not in a logged-in state** — cannot confirm server or account
3. **All data accessibility claims are documentation-based, NOT tested**
4. **No reliability data available** — single failed attempt, no successful connections
5. **This POC does NOT constitute production readiness assessment**
6. **No write operations were tested** — by design
