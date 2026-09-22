import {
  ProviderSnapshot,
  ProviderAccountInfo,
  ProviderPosition,
  ProviderOrder,
  ProviderDeal,
  MonitoringSnapshot,
  MonitoringPosition,
  MonitoringOrder,
  MonitoringHistorySummary,
  MonitoringAccountInfo,
  ProviderName,
} from "./types";

export interface NormalizeResult {
  success: boolean;
  snapshot: MonitoringSnapshot | null;
  accountInfo: MonitoringAccountInfo | null;
  errors: NormalizeError[];
}

export interface NormalizeError {
  code: string;
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  field?: string;
  context?: Record<string, unknown>;
}

function maskLogin(login?: number | null): string {
  if (login === undefined || login === null) return "[MASKED]";
  const str = String(login);
  if (str.length <= 2) return `[MASKED-${str}***]`;
  return `[MASKED-${str.slice(0, 2)}***]`;
}

function normalizeDirection(type: number | null | undefined): "BUY" | "SELL" | null {
  if (type === undefined || type === null) return null;
  if (type === 0) return "BUY";
  if (type === 1) return "SELL";
  return null;
}

function normalizeOrderState(state: number | null | undefined): string | null {
  if (state === undefined || state === null) return null;
  const states: Record<number, string> = {
    0: "PENDING",
    1: "PLACED",
    2: "PARTIAL",
    3: "FILLED",
    4: "CANCELED",
    5: "EXPIRED",
  };
  return states[state] ?? null;
}

export function normalizeSnapshot(
  accountId: string,
  accountNumber: string | null,
  provider: ProviderName,
  raw: ProviderSnapshot
): NormalizeResult {
  const errors: NormalizeError[] = [];

  if (!raw) {
    errors.push({
      code: "NULL_PROVIDER_RESPONSE",
      message: "Provider returned null response",
      severity: "HIGH",
      field: "snapshot",
    });
    return { success: false, snapshot: null, accountInfo: null, errors };
  }

  const accountInfo = normalizeAccountInfo(raw.accountInfo, errors);
  const positions = normalizePositions(raw.positions, errors);
  const orders = normalizeOrders(raw.orders, errors);
  const historySummary = normalizeHistory(raw.history);

  const snapshot: MonitoringSnapshot = {
    accountId,
    accountLoginMasked: maskLogin(raw.accountInfo?.login),
    accountNumber,
    server: raw.accountInfo?.server ?? null,
    broker: raw.accountInfo?.broker ?? null,
    balance: raw.accountInfo?.balance ?? null,
    equity: raw.accountInfo?.equity ?? null,
    freeMargin: raw.accountInfo?.freeMargin ?? null,
    margin: raw.accountInfo?.margin ?? null,
    marginLevel: raw.accountInfo?.marginLevel ?? null,
    currency: raw.accountInfo?.currency ?? null,
    leverage: raw.accountInfo?.leverage ?? null,
    isDemo: raw.accountInfo?.isDemo ?? null,
    positions,
    orders,
    historySummary,
    terminalConnected: raw.terminalInfo?.connected ?? null,
    terminalVersion: raw.terminalInfo?.version ?? null,
    dataTimestamp: raw.timestamp ?? null,
    provider,
    snapshotTimestamp: new Date(),
  };

  const isPartial = errors.length > 0 && errors.some((e) => e.severity === "HIGH" || e.severity === "CRITICAL");
  if (isPartial) {
    errors.push({
      code: "PARTIAL_SNAPSHOT",
      message: "Snapshot has errors but was partially normalized",
      severity: "MEDIUM",
    });
  }

  return {
    success: !errors.some((e) => e.severity === "CRITICAL"),
    snapshot,
    accountInfo: accountInfo,
    errors,
  };
}

function normalizeAccountInfo(
  info: ProviderAccountInfo | null | undefined,
  errors: NormalizeError[]
): MonitoringAccountInfo | null {
  if (!info) {
    errors.push({
      code: "NULL_ACCOUNT_INFO",
      message: "Provider returned no account information",
      severity: "HIGH",
      field: "accountInfo",
    });
    return null;
  }

  if (info.balance !== null && info.balance !== undefined && isNaN(info.balance)) {
    errors.push({ code: "INVALID_BALANCE", message: "Balance is not a valid number", severity: "HIGH", field: "balance" });
  }
  if (info.equity !== null && info.equity !== undefined && isNaN(info.equity)) {
    errors.push({ code: "INVALID_EQUITY", message: "Equity is not a valid number", severity: "HIGH", field: "equity" });
  }
  if (info.margin !== null && info.margin !== undefined && isNaN(info.margin)) {
    errors.push({ code: "INVALID_MARGIN", message: "Margin is not a valid number", severity: "HIGH", field: "margin" });
  }
  if (info.freeMargin !== null && info.freeMargin !== undefined && isNaN(info.freeMargin)) {
    errors.push({ code: "INVALID_FREE_MARGIN", message: "Free margin is not a valid number", severity: "HIGH", field: "freeMargin" });
  }

  return {
    loginMasked: maskLogin(info.login),
    server: info.server ?? null,
    broker: info.broker ?? null,
    balance: info.balance ?? null,
    equity: info.equity ?? null,
    freeMargin: info.freeMargin ?? null,
    margin: info.margin ?? null,
    marginLevel: info.marginLevel ?? null,
    currency: info.currency ?? null,
    leverage: info.leverage ?? null,
    isDemo: info.isDemo ?? null,
    hasPositions: false,
    hasOrders: false,
    hasHistory: false,
    positionCount: 0,
    orderCount: 0,
    historyCount: 0,
    unrealizedPnl: null,
    realizedPnlToday: null,
  };
}

function normalizePositions(rawPositions: ProviderPosition[] | null | undefined, errors: NormalizeError[]): MonitoringPosition[] {
  if (!rawPositions) return [];
  const positions: MonitoringPosition[] = [];
  for (const p of rawPositions) {
    if (p === null || p === undefined) {
      errors.push({ code: "NULL_POSITION", message: "Null position in response", severity: "LOW", field: "positions" });
      continue;
    }
    positions.push({
      symbol: p.symbol ?? null,
      direction: normalizeDirection(p.type),
      volume: p.volume ?? null,
      openPrice: p.price ?? null,
      currentPrice: null,
      stopLoss: p.sl ?? null,
      takeProfit: p.tp ?? null,
      profit: p.profit ?? null,
      swap: p.swap ?? null,
      openTime: p.openTime ?? null,
    });
  }
  return positions;
}

function normalizeOrders(rawOrders: ProviderOrder[] | null | undefined, errors: NormalizeError[]): MonitoringOrder[] {
  if (!rawOrders) return [];
  const orders: MonitoringOrder[] = [];
  for (const o of rawOrders) {
    if (o === null || o === undefined) {
      errors.push({ code: "NULL_ORDER", message: "Null order in response", severity: "LOW", field: "orders" });
      continue;
    }
    orders.push({
      symbol: o.symbol ?? null,
      type: normalizeOrderState(o.type),
      volume: o.volume ?? null,
      price: o.price ?? null,
      state: normalizeOrderState(o.state),
      time: o.time ?? null,
    });
  }
  return orders;
}

function normalizeHistory(rawDeals: ProviderDeal[] | null | undefined): MonitoringHistorySummary {
  if (!rawDeals) {
    return { dealCount: 0, totalRealizedPnl: null, winCount: 0, lossCount: 0, periodStart: null, periodEnd: null };
  }

  let totalRealizedPnl = 0;
  let winCount = 0;
  let lossCount = 0;
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;

  for (const d of rawDeals) {
    if (d === null || d === undefined) continue;
    if (d.profit !== null && d.profit !== undefined && !isNaN(d.profit)) {
      totalRealizedPnl += d.profit;
      if (d.profit >= 0) {
        winCount++;
      } else {
        lossCount++;
      }
    }
    if (d.time && (!periodStart || d.time < periodStart)) periodStart = d.time;
    if (d.time && (!periodEnd || d.time > periodEnd)) periodEnd = d.time;
  }

  return {
    dealCount: rawDeals.length,
    totalRealizedPnl,
    winCount,
    lossCount,
    periodStart,
    periodEnd,
  };
}
