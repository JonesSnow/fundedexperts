import { MT5Adapter } from "./adapter";
import { MockMT5Adapter, MockAdapterConfig } from "./mock-adapter";
import { RealMT5Adapter, RealAdapterConfig } from "./real-mt5-adapter";

export type AdapterMode = "mock" | "real" | "auto";

export interface AdapterFactoryConfig {
  mode?: AdapterMode;
  mockConfig?: MockAdapterConfig;
  realConfig?: RealAdapterConfig;
}

export function createMT5Adapter(config: AdapterFactoryConfig = {}): MT5Adapter {
  const mode = config.mode ?? "mock";

  switch (mode) {
    case "mock":
      return new MockMT5Adapter(config.mockConfig ?? { accounts: [] });
    case "real":
      return new RealMT5Adapter(config.realConfig);
    case "auto": {
      const useReal = process.env.MT5_USE_REAL_ADAPTER === "true";
      if (useReal) {
        return new RealMT5Adapter(config.realConfig);
      }
      return new MockMT5Adapter(config.mockConfig ?? { accounts: [] });
    }
    default:
      return new MockMT5Adapter(config.mockConfig ?? { accounts: [] });
  }
}

export function isRealAdapter(adapter: MT5Adapter): boolean {
  return adapter instanceof RealMT5Adapter;
}

export function isMockAdapter(adapter: MT5Adapter): boolean {
  return adapter instanceof MockMT5Adapter;
}
