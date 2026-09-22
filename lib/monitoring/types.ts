export type ProviderName = "MT5" | "XM" | "OTHER";

export type HealthStatus = "HEALTHY" | "DEGRADED" | "DISCONNECTED" | "STALE" | "ERROR" | "UNKNOWN";

export type SnapshotStatus = "SUCCESS" | "PARTIAL" | "VALIDATION_FAILURE" | "PROVIDER_FAILURE" | "TIMEOUT" | "DISCONNECTED" | "UNSUPPORTED_FIELD" | "UNKNOWN_ACCOUNT";

export type Retryability = "RETRYABLE" | "NON_RETRYABLE";

export interface ProviderAccountInfo {
  login?: number | null;
  server?: string | null;
  broker?: string | null;
  company?: string | null;
  balance?: number | null;
  equity?: number | null;
  freeMargin?: number | null;
  margin?: number | null;
  marginLevel?: number | null;
  currency?: string | null;
  leverage?: number | null;
  isDemo?: boolean | null;
  accountType?: number | null;
  accountCategory?: number | null;
  deposit?: number | null;
  credit?: number | null;
  name?: string | null;
  comment?: string | null;
}

export interface ProviderPosition {
  ticket?: number | null;
  symbol?: string | null;
  type?: number | null;
  volume?: number | null;
  price?: number | null;
  sl?: number | null;
  tp?: number | null;
  profit?: number | null;
  swap?: number | null;
  openTime?: Date | null;
  comment?: string | null;
}

export interface ProviderOrder {
  ticket?: number | null;
  symbol?: string | null;
  type?: number | null;
  volume?: number | null;
  price?: number | null;
  sl?: number | null;
  tp?: number | null;
  state?: number | null;
  time?: Date | null;
  comment?: string | null;
}

export interface ProviderDeal {
  ticket?: number | null;
  symbol?: string | null;
  type?: number | null;
  volume?: number | null;
  price?: number | null;
  profit?: number | null;
  swap?: number | null;
  commission?: number | null;
  time?: Date | null;
  reason?: number | null;
  comment?: string | null;
}

export interface ProviderSnapshot {
  accountInfo: ProviderAccountInfo | null;
  positions: ProviderPosition[];
  orders: ProviderOrder[];
  history: ProviderDeal[];
  terminalInfo?: {
    connected?: boolean | null;
    version?: string | null;
    build?: string | null;
  } | null;
  timestamp?: Date | null;
  provider?: ProviderName;
  requestId?: string | null;
}

export interface MonitoringAccountInfo {
  loginMasked: string;
  server: string | null;
  broker: string | null;
  balance: number | null;
  equity: number | null;
  freeMargin: number | null;
  margin: number | null;
  marginLevel: number | null;
  currency: string | null;
  leverage: number | null;
  isDemo: boolean | null;
  hasPositions: boolean;
  hasOrders: boolean;
  hasHistory: boolean;
  positionCount: number;
  orderCount: number;
  historyCount: number;
  unrealizedPnl: number | null;
  realizedPnlToday: number | null;
}

export interface MonitoringSnapshot {
  accountId: string;
  accountLoginMasked: string;
  accountNumber: string | null;
  server: string | null;
  broker: string | null;
  balance: number | null;
  equity: number | null;
  freeMargin: number | null;
  margin: number | null;
  marginLevel: number | null;
  currency: string | null;
  leverage: number | null;
  isDemo: boolean | null;
  positions: MonitoringPosition[];
  orders: MonitoringOrder[];
  historySummary: MonitoringHistorySummary;
  terminalConnected: boolean | null;
  terminalVersion: string | null;
  dataTimestamp: Date | null;
  provider: ProviderName;
  snapshotTimestamp: Date;
}

export interface MonitoringPosition {
  symbol: string | null;
  direction: "BUY" | "SELL" | null;
  volume: number | null;
  openPrice: number | null;
  currentPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  profit: number | null;
  swap: number | null;
  openTime: Date | null;
}

export interface MonitoringOrder {
  symbol: string | null;
  type: string | null;
  volume: number | null;
  price: number | null;
  state: string | null;
  time: Date | null;
}

export interface MonitoringHistorySummary {
  dealCount: number;
  totalRealizedPnl: number | null;
  winCount: number;
  lossCount: number;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface MonitoringSnapshotContext {
  accountId: string;
  accountNumber: string | null;
  provider: ProviderName;
  snapshotTimestamp: Date;
  dataTimestamp: Date | null;
}
