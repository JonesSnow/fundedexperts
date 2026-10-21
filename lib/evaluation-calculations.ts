/**
 * Pure calculation helpers for evaluation rules. These functions intentionally
 * require complete, explicit definitions and inputs. An unsupported or
 * incomplete policy must not become a passing result.
 */

export type CalculationState = "PASS" | "FAIL" | "INCOMPLETE" | "STALE" | "UNAVAILABLE";

export interface CalculationResult<TActual = unknown, TExpected = unknown> {
  state: CalculationState;
  actualValue: TActual | null;
  expectedValue: TExpected | null;
  details: string;
}

export type PnlComponent = "realizedPnl" | "floatingPnl" | "commissionCosts" | "swapPnl" | "otherFees";

export function buildRuleEventIdempotencyKey(evaluationId: string, ruleId: string): string {
  return `evaluation:${evaluationId}:rule:${ruleId}`;
}

export interface DailyPnlComponents {
  realizedPnl: number | null;
  floatingPnl: number | null;
  commissionCosts: number | null;
  swapPnl: number | null;
  otherFees: number | null;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface DailyLossDefinition {
  schemaVersion: 1;
  method: "NET_PNL_COMPONENTS";
  timezone: string;
  resetTime: string;
  maxSnapshotAgeMs: number;
  includedPnlComponents: PnlComponent[];
  breachComparison: "STRICTLY_GREATER_THAN" | "GREATER_THAN_OR_EQUAL";
}

export interface DailyLossInput {
  asOf: Date;
  dataTimestamp: Date | null;
  maxLoss: number;
  components: DailyPnlComponents | null;
}

export interface TradingActivityEvent {
  eventId: string;
  symbol: string | null;
  occurredAt: Date | null;
  completedAt?: Date | null;
}

export interface DrawdownInput {
  equity: number | null;
  startingBalance: number | null;
  historicalPeakEquity: number | null;
  maxDrawdown: number;
  model: "STATIC_STARTING_EQUITY" | "TRAILING_PEAK_EQUITY";
  breachComparison: "STRICTLY_GREATER_THAN" | "GREATER_THAN_OR_EQUAL";
  historyComplete: boolean;
  dataTimestamp: Date | null;
  asOf: Date;
  maxSnapshotAgeMs: number;
}

export interface TradingHoursDefinition {
  schemaVersion: 1;
  method: "EVENT_WITHIN_WEEKLY_WINDOW";
  timezone: string;
  startTime: string;
  endTime: string;
  allowedDays: number[];
}

export interface TradingHoursInput {
  events: TradingActivityEvent[] | null;
  asOf: Date;
  dataTimestamp: Date | null;
  maxSnapshotAgeMs: number;
}

function unavailable<TActual = unknown, TExpected = unknown>(details: string, actualValue: TActual | null = null, expectedValue: TExpected | null = null): CalculationResult<TActual, TExpected> {
  return { state: "UNAVAILABLE", actualValue, expectedValue, details: `UNAVAILABLE: ${details}` };
}

function stale<TActual = unknown, TExpected = unknown>(details: string, actualValue: TActual | null = null, expectedValue: TExpected | null = null): CalculationResult<TActual, TExpected> {
  return { state: "STALE", actualValue, expectedValue, details: `STALE: ${details}` };
}

function incomplete<TActual = unknown, TExpected = unknown>(details: string, actualValue: TActual | null = null, expectedValue: TExpected | null = null): CalculationResult<TActual, TExpected> {
  return { state: "INCOMPLETE", actualValue, expectedValue, details: `INCOMPLETE: ${details}` };
}

function validDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function getDataFreshnessState(dataTimestamp: Date | null, asOf: Date, maxAgeMs: number): "PASS" | "STALE" | "UNAVAILABLE" {
  if (!validDate(dataTimestamp) || !validDate(asOf) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return "UNAVAILABLE";
  if (dataTimestamp.getTime() > asOf.getTime()) return "UNAVAILABLE";
  return asOf.getTime() - dataTimestamp.getTime() > maxAgeMs ? "STALE" : "PASS";
}

function timezoneFormatter(timezone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23", weekday: "short",
    });
  } catch {
    return null;
  }
}

function localParts(date: Date, formatter: Intl.DateTimeFormat): Record<string, string> {
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function sameWallTime(parts: Record<string, string>, year: number, month: number, day: number, hour: number, minute: number): boolean {
  return Number(parts.year) === year && Number(parts.month) === month && Number(parts.day) === day &&
    Number(parts.hour) === hour && Number(parts.minute) === minute && Number(parts.second) === 0;
}

/** Resolves a wall-clock reset only when it maps to exactly one instant. */
function wallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date | null {
  const formatter = timezoneFormatter(timezone);
  if (!formatter) return null;

  const wallEpoch = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsets = new Set<number>();
  for (let deltaHours = -36; deltaHours <= 36; deltaHours += 3) {
    const probe = new Date(wallEpoch + deltaHours * 60 * 60 * 1000);
    const p = localParts(probe, formatter);
    const localEpoch = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    offsets.add(localEpoch - probe.getTime());
  }

  const matches = [...offsets]
    .map((offset) => new Date(wallEpoch - offset))
    .filter((candidate) => sameWallTime(localParts(candidate, formatter), year, month, day, hour, minute));
  return matches.length === 1 ? matches[0] : null;
}

function priorCalendarDay(year: number, month: number, day: number): [number, number, number] {
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return [previous.getUTCFullYear(), previous.getUTCMonth() + 1, previous.getUTCDate()];
}


export function resolveDailyResetBoundary(asOf: Date, timezone: string, resetTime: string): Date | null {
  if (!validDate(asOf) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(resetTime)) return null;
  const formatter = timezoneFormatter(timezone);
  if (!formatter) return null;
  const local = localParts(asOf, formatter);
  const [hour, minute] = resetTime.split(":").map(Number);
  let date: [number, number, number] = [Number(local.year), Number(local.month), Number(local.day)];
  const localMinutes = Number(local.hour) * 60 + Number(local.minute);
  if (localMinutes < hour * 60 + minute) date = priorCalendarDay(...date);
  return wallTimeToUtc(...date, hour, minute, timezone);
}

export function evaluateDailyLoss(input: DailyLossInput, definition: DailyLossDefinition): CalculationResult<number, { maxLoss: number; lossAmount: number }> {
  if (definition.schemaVersion !== 1 || definition.method !== "NET_PNL_COMPONENTS") return unavailable("daily-loss calculation method or schema version is unsupported");
  if (!timezoneFormatter(definition.timezone)) return unavailable("daily-loss timezone is invalid");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(definition.resetTime)) return unavailable("daily-loss reset time is missing or invalid");
  if (!Number.isFinite(definition.maxSnapshotAgeMs) || definition.maxSnapshotAgeMs < 0) return unavailable("daily-loss data freshness limit is missing or invalid");
  if (!Number.isFinite(input.maxLoss) || input.maxLoss < 0) return unavailable("daily-loss threshold is missing or invalid");
  const freshness = getDataFreshnessState(input.dataTimestamp, input.asOf, definition.maxSnapshotAgeMs);
  if (freshness === "STALE") return stale("daily-loss trading data exceeds the configured freshness limit");
  if (freshness !== "PASS") return unavailable("daily-loss trading data is missing or future-dated");
  if (!input.components) return unavailable("daily PnL components for the configured period are missing");

  const resetBoundary = resolveDailyResetBoundary(input.asOf, definition.timezone, definition.resetTime);
  if (!resetBoundary) return unavailable("daily reset boundary is ambiguous, nonexistent, or invalid for this timezone");
  if (!validDate(input.components.periodStart) || input.components.periodStart.getTime() !== resetBoundary.getTime()) {
    return unavailable("daily PnL period does not match the configured reset boundary");
  }
  if (!validDate(input.components.periodEnd) || input.components.periodEnd.getTime() > input.asOf.getTime() ||
      input.components.periodEnd.getTime() > input.dataTimestamp!.getTime() || input.components.periodEnd.getTime() < resetBoundary.getTime()) {
    return unavailable("daily PnL period end is missing or inconsistent with the evaluation timestamp");
  }
  if (!Array.isArray(definition.includedPnlComponents) || definition.includedPnlComponents.length === 0 || new Set(definition.includedPnlComponents).size !== definition.includedPnlComponents.length) {
    return unavailable("daily-loss policy must explicitly list unique PnL components");
  }

  let netPnl = 0;
  for (const component of definition.includedPnlComponents) {
    const value = input.components[component];
    if (typeof value !== "number" || !Number.isFinite(value)) return unavailable(`configured PnL component ${component} is missing or invalid`);
    netPnl += component === "commissionCosts" || component === "otherFees" ? -Math.abs(value) : value;
  }
  const lossAmount = Math.round(Math.max(0, -netPnl) * 100) / 100;
  const breached = definition.breachComparison === "GREATER_THAN_OR_EQUAL"
    ? lossAmount >= input.maxLoss
    : definition.breachComparison === "STRICTLY_GREATER_THAN"
      ? lossAmount > input.maxLoss
      : null;
  if (breached === null) return unavailable("daily-loss breach comparison is unsupported", lossAmount, { maxLoss: input.maxLoss, lossAmount });
  return {
    state: breached ? "FAIL" : "PASS",
    actualValue: lossAmount,
    expectedValue: { maxLoss: input.maxLoss, lossAmount },
    details: `${breached ? "FAIL" : "PASS"}: daily loss ${lossAmount.toFixed(2)}; configured limit ${input.maxLoss.toFixed(2)} (${definition.breachComparison})`,
  };
}

export function evaluateDrawdown(input: DrawdownInput): CalculationResult<number, { maxDrawdown: number; referenceEquity: number }> {
  if (!Number.isFinite(input.maxDrawdown) || input.maxDrawdown < 0) return unavailable("drawdown threshold is missing or invalid");
  const freshness = getDataFreshnessState(input.dataTimestamp, input.asOf, input.maxSnapshotAgeMs);
  if (freshness === "STALE") return stale("drawdown snapshot exceeds the configured freshness limit");
  if (freshness !== "PASS") return unavailable("drawdown snapshot is missing or future-dated");
  if (typeof input.equity !== "number" || !Number.isFinite(input.equity)) return unavailable("current equity is missing or invalid");

  let referenceEquity: number;
  if (input.model === "STATIC_STARTING_EQUITY") {
    if (typeof input.startingBalance !== "number" || !Number.isFinite(input.startingBalance)) return unavailable("starting balance for static drawdown is missing or invalid");
    referenceEquity = input.startingBalance;
  } else if (input.model === "TRAILING_PEAK_EQUITY") {
    if (!input.historyComplete) return unavailable("complete historical equity data is required for trailing drawdown");
    if (typeof input.historicalPeakEquity !== "number" || !Number.isFinite(input.historicalPeakEquity)) return unavailable("historical peak equity is missing or invalid");
    if (input.historicalPeakEquity < input.equity) return unavailable("historical peak equity is below current equity; account history is inconsistent");
    referenceEquity = input.historicalPeakEquity;
  } else {
    return unavailable("drawdown model is unsupported");
  }

  const drawdown = Math.round(Math.max(0, referenceEquity - input.equity) * 100) / 100;
  const breached = input.breachComparison === "GREATER_THAN_OR_EQUAL"
    ? drawdown >= input.maxDrawdown
    : input.breachComparison === "STRICTLY_GREATER_THAN"
      ? drawdown > input.maxDrawdown
      : null;
  if (breached === null) return unavailable("drawdown breach comparison is unsupported", drawdown, { maxDrawdown: input.maxDrawdown, referenceEquity });
  return {
    state: breached ? "FAIL" : "PASS",
    actualValue: drawdown,
    expectedValue: { maxDrawdown: input.maxDrawdown, referenceEquity },
    details: `${breached ? "FAIL" : "PASS"}: drawdown ${drawdown.toFixed(2)} against reference equity ${referenceEquity.toFixed(2)} and limit ${input.maxDrawdown.toFixed(2)}`,
  };
}

export function countUniqueCompletedTrades(events: TradingActivityEvent[] | null): number | null {
  if (!events) return null;
  const completed = events.filter((event) => typeof event.eventId === "string" && event.eventId.length > 0 && validDate(event.completedAt));
  if (completed.length !== events.filter((event) => event.completedAt !== null && event.completedAt !== undefined).length) return null;
  return new Set(completed.map((event) => event.eventId)).size;
}

export function countUniqueTradingDays(events: TradingActivityEvent[] | null, timezone: string): number | null {
  if (!events || !timezoneFormatter(timezone)) return null;
  const completed = events.filter((event) => typeof event.eventId === "string" && event.eventId.length > 0 && validDate(event.completedAt));
  if (completed.length !== events.filter((event) => event.completedAt !== null && event.completedAt !== undefined).length) return null;
  const formatter = timezoneFormatter(timezone)!;
  const eventDay = new Map<string, string>();
  for (const event of completed) {
    const p = localParts(event.completedAt!, formatter);
    const day = `${p.year}-${p.month}-${p.day}`;
    const previous = eventDay.get(event.eventId);
    if (previous && previous !== day) return null;
    eventDay.set(event.eventId, day);
  }
  return new Set(eventDay.values()).size;
}

export function evaluateMinimumCount(actual: number | null, minimum: number, label: string): CalculationResult<number, { minimum: number }> {
  if (!Number.isInteger(minimum) || minimum < 0) return unavailable(`${label} threshold is missing or invalid`);
  if (actual === null) return unavailable(`complete, uniquely identified ${label.toLowerCase()} activity is unavailable`);
  return actual >= minimum
    ? { state: "PASS", actualValue: actual, expectedValue: { minimum }, details: `PASS: ${label} met (${actual} >= ${minimum})` }
    : incomplete(`${label} not yet met (${actual} < ${minimum})`, actual, { minimum });
}

function localMinuteAndWeekday(date: Date, timezone: string): { minute: number; day: number } | null {
  const formatter = timezoneFormatter(timezone);
  if (!formatter) return null;
  const parts = localParts(date, formatter);
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[parts.weekday];
  return Number.isFinite(minute) && day !== undefined ? { minute, day } : null;
}

export function evaluateTradingHours(input: TradingHoursInput, definition: TradingHoursDefinition): CalculationResult<{ checked: number; violations: number }, { startTime: string; endTime: string; timezone: string; allowedDays: number[] }> {
  if (definition.schemaVersion !== 1 || definition.method !== "EVENT_WITHIN_WEEKLY_WINDOW") return unavailable("trading-hours calculation method or schema version is unsupported");
  if (!timezoneFormatter(definition.timezone)) return unavailable("trading-hours timezone is invalid");
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(definition.startTime) || !timePattern.test(definition.endTime) || definition.startTime === definition.endTime) return unavailable("trading-hours window is missing or invalid");
  if (!Array.isArray(definition.allowedDays) || definition.allowedDays.length === 0 || definition.allowedDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return unavailable("trading-hours policy requires explicit weekdays from 0 to 6");
  const freshness = getDataFreshnessState(input.dataTimestamp, input.asOf, input.maxSnapshotAgeMs);
  if (freshness === "STALE") return stale("trading activity data exceeds the configured freshness limit");
  if (freshness !== "PASS") return unavailable("trading activity data is missing or future-dated");
  if (!input.events || input.events.length === 0) return incomplete("no qualifying trade events are available for this interval");
  if (input.events.some((event) => !validDate(event.occurredAt))) return unavailable("one or more trade events have no valid event timestamp");

  const [startHour, startMinute] = definition.startTime.split(":").map(Number);
  const [endHour, endMinute] = definition.endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  let violations = 0;
  for (const event of input.events) {
    const local = localMinuteAndWeekday(event.occurredAt!, definition.timezone);
    if (!local) return unavailable("trade event timezone conversion failed");
    const inWindow = start < end
      ? local.minute >= start && local.minute < end
      : local.minute >= start || local.minute < end;
    const policyDay = start < end || local.minute >= start ? local.day : (local.day + 6) % 7;
    if (!inWindow || !definition.allowedDays.includes(policyDay)) violations += 1;
  }
  const expectedValue = { startTime: definition.startTime, endTime: definition.endTime, timezone: definition.timezone, allowedDays: definition.allowedDays };
  return {
    state: violations > 0 ? "FAIL" : "PASS",
    actualValue: { checked: input.events.length, violations },
    expectedValue,
    details: `${violations > 0 ? "FAIL" : "PASS"}: checked ${input.events.length} trade event(s); ${violations} outside configured trading hours`,
  };
}

export function evaluateAllowedSymbols(events: TradingActivityEvent[] | null, allowedSymbols: unknown): CalculationResult<{ checked: number; violations: number }, { allowedSymbols: string[] }> {
  if (!Array.isArray(allowedSymbols) || allowedSymbols.length === 0 || allowedSymbols.some((symbol) => typeof symbol !== "string" || !symbol.trim())) return unavailable("an explicit allowed-symbol list is required");
  if (!events || events.length === 0) return incomplete("no qualifying trade events are available to check against allowed symbols");
  if (events.some((event) => typeof event.symbol !== "string" || !event.symbol.trim())) return unavailable("one or more trade events have no symbol");
  const allowed = new Set((allowedSymbols as string[]).map((symbol) => symbol.toUpperCase()));
  const violations = events.filter((event) => !allowed.has(event.symbol!.toUpperCase())).length;
  return {
    state: violations > 0 ? "FAIL" : "PASS",
    actualValue: { checked: events.length, violations },
    expectedValue: { allowedSymbols: allowedSymbols as string[] },
    details: `${violations > 0 ? "FAIL" : "PASS"}: checked ${events.length} trade event(s) against ${allowed.size} allowed symbol(s)`,
  };
}
