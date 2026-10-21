import { MT5Adapter } from "./adapter";
import { MockMT5Adapter, MockAdapterConfig } from "./mock-adapter";
import { RealMT5Adapter, RealAdapterConfig } from "./real-mt5-adapter";

export type AdapterMode = "mock" | "real" | "auto";

export interface AdapterFactoryConfig {
  mode?: AdapterMode;
  mockConfig?: MockAdapterConfig;
  realConfig?: RealAdapterConfig;
}

export function assertNoMockAdapterInProduction(
  adapter: MT5Adapter,
  environment: string | undefined = process.env.NODE_ENV,
): void {
  if (environment === "production" && isMockAdapter(adapter)) {
    throw new Error("Mock MT5 adapters are disabled in production.");
  }
}

export function createMT5Adapter(config: AdapterFactoryConfig = {}): MT5Adapter {
  const mode = config.mode ?? "mock";

  let adapter: MT5Adapter;
  switch (mode) {
    case "mock":
      adapter = new MockMT5Adapter(config.mockConfig ?? { accounts: [] });
      break;
    case "real":
      adapter = new RealMT5Adapter(config.realConfig);
      break;
    case "auto": {
      const useReal = process.env.MT5_USE_REAL_ADAPTER === "true";
      if (useReal) {
        adapter = new RealMT5Adapter(config.realConfig);
        break;
      }
      adapter = new MockMT5Adapter(config.mockConfig ?? { accounts: [] });
      break;
    }
    default:
      throw new Error("Unsupported MT5 adapter mode.");
  }

  assertNoMockAdapterInProduction(adapter);
  return adapter;
}

export function isRealAdapter(adapter: MT5Adapter): boolean {
  return adapter instanceof RealMT5Adapter;
}

export function isMockAdapter(adapter: MT5Adapter): boolean {
  return adapter instanceof MockMT5Adapter;
}
