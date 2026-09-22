import { MT5Adapter, AdapterAccountInput, AdapterFetchOptions } from "./adapter";
import { ProviderSnapshot, ProviderAccountInfo, ProviderPosition, ProviderOrder, ProviderDeal, ProviderName } from "./types";

export interface MockAccountConfig {
  accountId: string;
  accountNumber: string;
  healthy?: boolean;
  reducedEquity?: boolean;
  positions?: ProviderPosition[];
  orders?: ProviderOrder[];
  disconnected?: boolean;
  missingData?: boolean;
  staleData?: boolean;
  timeout?: boolean;
  providerError?: boolean;
  malformed?: boolean;
  history?: ProviderDeal[];
  server?: string;
  broker?: string;
  balance?: number;
  equity?: number;
  freeMargin?: number;
  margin?: number;
  currency?: string;
  login?: number;
}

export interface MockAdapterConfig {
  accounts: MockAccountConfig[];
  defaultTimeoutMs?: number;
}

export class MockMT5Adapter extends MT5Adapter {
  readonly providerName = "MT5" as ProviderName;
  private accounts: Map<string, MockAccountConfig>;
  private defaultTimeoutMs: number;

  constructor(config: MockAdapterConfig) {
    super();
    this.accounts = new Map();
    for (const acc of config.accounts) {
      this.accounts.set(acc.accountId, {
        healthy: true,
        reducedEquity: false,
        positions: [],
        orders: [],
        history: [],
        server: "Server-XM",
        broker: "XM",
        balance: 100000,
        equity: 100000,
        freeMargin: 95000,
        margin: 5000,
        currency: "USD",
        login: 12345678,
        ...acc,
      });
    }
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 10000;
  }

  async fetchSnapshot(
    input: AdapterAccountInput,
    options?: AdapterFetchOptions
  ): Promise<ProviderSnapshot> {
    const config = this.accounts.get(input.accountId);
    if (!config) {
      return {
        accountInfo: null,
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: false, version: null, build: null },
        timestamp: new Date(),
        provider: "MT5",
        requestId: options?.requestId ?? null,
      };
    }

    if (config.timeout) {
      await this.delay(this.defaultTimeoutMs + 1000);
      throw this.createError("PROVIDER_TIMEOUT", "Provider request timed out", "HIGH", "TIMEOUT", "RETRYABLE");
    }

    if (config.providerError) {
      return {
        accountInfo: null,
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: false, version: null, build: null },
        timestamp: new Date(),
        provider: "MT5",
        requestId: options?.requestId ?? null,
      };
    }

    if (config.disconnected) {
      return {
        accountInfo: null,
        positions: [],
        orders: [],
        history: [],
        terminalInfo: { connected: false, version: null, build: null },
        timestamp: new Date(),
        provider: "MT5",
        requestId: options?.requestId ?? null,
      };
    }

    const accountInfo = this.buildAccountInfo(config);
    const positions = config.positions ?? [];
    const orders = config.orders ?? [];
    const history = config.history ?? [];

    let timestamp: Date | null = new Date();
    if (config.staleData) {
      timestamp = new Date(Date.now() - 600000);
    }

    if (config.malformed) {
      return {
        accountInfo: { login: "invalid" } as unknown as ProviderAccountInfo,
        positions: [] as unknown as ProviderPosition[],
        orders: [] as unknown as ProviderOrder[],
        history: [] as unknown as ProviderDeal[],
        terminalInfo: { connected: true, version: "1.2.3", build: "12345" },
        timestamp,
        provider: "MT5",
        requestId: options?.requestId ?? null,
      };
    }

    return {
      accountInfo,
      positions,
      orders,
      history,
      terminalInfo: { connected: true, version: "1.2.3", build: "12345" },
      timestamp,
      provider: "MT5",
      requestId: options?.requestId ?? null,
    };
  }

  async testConnection(accountId: string): Promise<{ connected: boolean; message: string }> {
    const config = this.accounts.get(accountId);
    if (!config) {
      return { connected: false, message: "Account not found" };
    }
    if (config.disconnected) {
      return { connected: false, message: "Terminal disconnected" };
    }
    return { connected: true, message: "Terminal connected" };
  }

  async disconnect(accountId: string): Promise<void> {
    const config = this.accounts.get(accountId);
    if (config) {
      config.disconnected = true;
    }
  }

  private buildAccountInfo(config: MockAccountConfig): ProviderAccountInfo {
    const isMissing = config.missingData ?? false;
    return {
      login: isMissing ? null : config.login,
      server: isMissing ? null : config.server,
      broker: isMissing ? null : config.broker,
      balance: isMissing ? null : config.balance,
      equity: isMissing ? null : config.equity,
      freeMargin: isMissing ? null : config.freeMargin,
      margin: isMissing ? null : config.margin,
      currency: isMissing ? null : config.currency,
      leverage: 100,
      isDemo: true,
      accountType: 0,
      accountCategory: 0,
    };
  }

  private createError(
    code: string,
    message: string,
    severity: string,
    category: string,
    retryable: string
  ): Error & { code: string; severity: string; category: string; retryable: string } {
    const err = new Error(message) as Error & { code: string; severity: string; category: string; retryable: string };
    err.code = code;
    err.severity = severity;
    err.category = category;
    err.retryable = retryable;
    return err;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
