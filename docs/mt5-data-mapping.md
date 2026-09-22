# MT5 Bridge Data Mapping

**Status:** DOCUMENTATION-BASED — No live data retrieved
**POC Date:** 2026-09-20
**Classification:** Theoretical mapping from MetaTrader5 Python package documentation

## Overview

This document maps MetaTrader5 Python package data fields to the Funded Experts domain model.
All mappings are based on package documentation, NOT live testing (no terminal connection established).

## Available via `mt5.account_info()`

| MetaTrader5 Field | Type | Funded Experts Domain | Calculation Required | Notes |
|---|---|---|---|---|
| `login` | int | MT5 Account ID | No | Mask in logs: `[MASKED-XX***]` |
| `balance` | float | Account Balance | No | Direct mapping |
| `equity` | float | Account Equity | No | Direct mapping |
| `margin` | float | Used Margin | No | Direct mapping |
| `margin_free` | float | Free Margin | No | Direct mapping |
| `margin_level` | float | Margin Level | No | (equity / margin) * 100 |
| `currency` | string | Account Currency | No | Direct mapping |
| `server` | string | Broker Server | No | Direct mapping |
| `company` | string | Broker Name | No | Direct mapping |
| `leverage` | int | Leverage | No | Direct mapping |
| `is_demo` | bool | Account Type | No | Distinguish demo vs live |
| `account_type` | int | Account Category | No | Requires XM-specific interpretation |
| `account_category` | int | Account Tier | No | Requires XM-specific interpretation |
| `deposit` | float | Initial Deposit | No | Direct mapping |
| `credit` | float | Credit | No | Direct mapping |
| `name` | string | Account Label | No | Direct mapping |
| `comment` | string | Account Note | No | SENSITIVE — masked in output |

## Available via `mt5.positions_get()`

| MetaTrader5 Field | Type | Funded Experts Domain | Calculation Required | Notes |
|---|---|---|---|---|
| `ticket` | int | Position ID | No | Unique identifier |
| `login` | int | Account ID | No | Mask in logs |
| `symbol` | string | Instrument | No | e.g., "EURUSD" |
| `type` | int | Position Direction | No | 0=buy, 1=sell |
| `volume` | float | Position Size | No | In lot units |
| `price` | float | Entry Price | No | Average open price |
| `sl` | float | Stop Loss | No | Direct mapping |
| `tp` | float | Take Profit | No | Direct mapping |
| `profit` | float | Unrealized P&L | No | Direct mapping |
| `swap` | float | Swap | No | Overnight fee |
| `time` | datetime | Open Time | No | Direct mapping |
| `time_msc` | int | Open Time (ms) | No | Millisecond precision |
| `comment` | string | Position Note | No | SENSITIVE — masked in output |
| `external_id` | string | External Ref | No | Broker trade ID |
| `reversal` | int | Reversal ID | No | Used in hedging |

## Available via `mt5.orders_get()`

| MetaTrader5 Field | Type | Funded Experts Domain | Calculation Required | Notes |
|---|---|---|---|---|
| `ticket` | int | Order ID | No | Unique identifier |
| `login` | int | Account ID | No | Mask in logs |
| `symbol` | string | Instrument | No | Direct mapping |
| `type` | int | Order Type | No | 0=buy, 1=sell, etc. |
| `volume` | float | Order Volume | No | In lot units |
| `price` | float | Order Price | No | Limit/stop price |
| `sl` | float | Stop Loss | No | Direct mapping |
| `tp` | float | Take Profit | No | Direct mapping |
| `time` | datetime | Order Time | No | Direct mapping |
| `state` | int | Order State | No | 0=pending, 1=placed, etc. |
| `type_time` | int | Time Type | No | GTC, IOC, etc. |
| `type_filling` | int | Filling Type | No | Return, FOK, IOC |
| `comment` | string | Order Note | No | SENSITIVE — masked |

## Available via `mt5.history_deals_get()`

| MetaTrader5 Field | Type | Funded Experts Domain | Calculation Required | Notes |
|---|---|---|---|---|
| `ticket` | int | Deal ID | No | Unique identifier |
| `login` | int | Account ID | No | Mask in logs |
| `symbol` | string | Instrument | No | Direct mapping |
| `type` | int | Deal Type | No | 0=buy, 1=sell, 2=close by |
| `volume` | float | Deal Volume | No | In lot units |
| `price` | float | Close Price | No | Average close price |
| `slippage` | int | Slippage | No | Direct mapping |
| `profit` | float | Realized P&L | No | Direct mapping |
| `swap` | float | Swap | No | Overnight fee |
| `commission` | float | Commission | No | Direct mapping |
| `time` | datetime | Close Time | No | Direct mapping |
| `reason` | int | Close Reason | No | Important for rules |
| `comment` | string | Deal Note | No | SENSITIVE — masked |

## Derived Fields (Require Calculation)

| Field | Calculation | Data Source | Notes |
|---|---|---|---|
| **Daily Loss** | Sum of negative P&L for current trading day | `history_deals_get()` filtered by date + `profit` field | Requires server timezone knowledge |
| **Overall Loss** | Cumulative negative P&L since account start | `history_deals_get()` all history + `profit` field | Requires defined start date |
| **Trading Days** | Count of days with at least one deal | `history_deals_get()` date range + day count | Server timezone critical |
| **Net P&L** | Sum of all realized P&L | `history_deals_get()` `profit` field | Simple aggregation |
| **Max Drawdown** | Peak-to-trough decline | Requires balance history over time | NOT available from terminal bridge in real-time |

## Unavailable Through Bridge

| Field | Why Unavailable | Workaround |
|---|---|---|
| Server timezone | Not explicitly returned by `account_info()` | Infer from server time via `mt5.symbol_info_tick()` |
| Balance history | Not available through terminal bridge | Poll `account_info().balance` at intervals and store |
| Max drawdown | Requires historical balance series | Calculate from stored balance snapshots |
| Trading days (monthly) | Requires deal date aggregation | Calculate from `history_deals_get()` with date filter |
| Profit factor | Requires gross profit/gross loss | Calculate from `history_deals_get()` `profit` field |
| Spread data | Not in account/position data | Use `mt5.symbol_info_tick()` for bid/ask |
| Server time | Not directly available | Use `mt5.symbol_info_tick()` for last update time |

## Fields Requiring Broker-Specific Verification

| Field | Concern | Action Required |
|---|---|---|
| `account_type` | XM-specific enumeration | Verify XM account type codes |
| `account_category` | XM-specific tier | Verify XM tier codes |
| `reason` (deal close) | XM may use custom reason codes | Verify XM-specific close reasons |
| `type_filling` | Broker-dependent | Verify XM supports all filling types |
| `type_time` | Broker-dependent order time types | Verify XM-specific GTC/IOC behavior |
| Daily reset time | XM server midnight may differ from UTC | Verify server timezone and reset time |
| Margin calculation | XM may have unique margin rules | Verify margin calculation methodology |

## Daily Loss Calculation Notes

**Critical Uncertainty:** XM's definition of "trading day" for drawdown purposes:
1. May align with server time midnight (likely in GMT or broker timezone)
2. May align with New York close (5pm EST)
3. May differ from UTC midnight
4. Requires verification with XM documentation

**Recommended:** Verify with XM documentation before implementing daily loss rules. The terminal bridge can provide deal timestamps but the timezone interpretation must be confirmed.
