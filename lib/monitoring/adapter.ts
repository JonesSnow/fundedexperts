import { ProviderSnapshot, ProviderName } from "./types";

export interface AdapterAccountInput {
  accountId: string;
  accountNumber: string | null;
  provider: ProviderName;
  credentials?: string | null;
  timeoutMs?: number;
}

export interface AdapterFetchOptions {
  timeoutMs?: number;
  retries?: number;
  requestId?: string | null;
}

export abstract class MT5Adapter {
  abstract readonly providerName: ProviderName;

  abstract fetchSnapshot(input: AdapterAccountInput, options?: AdapterFetchOptions): Promise<ProviderSnapshot>;

  abstract testConnection(accountId: string): Promise<{ connected: boolean; message: string }>;

  abstract disconnect(accountId: string): Promise<void>;
}
