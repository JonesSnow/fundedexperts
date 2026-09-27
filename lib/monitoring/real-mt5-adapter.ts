/**
 * Real MT5 Adapter
 *
 * Connects to MetaTrader 5 terminal via the official MetaTrader5 Python package
 * using a subprocess bridge. Requires MT5 terminal running and logged in on a
 * Windows host.
 *
 * Architecture:
 *   RealMT5Adapter (Node.js worker)
 *     → spawns Python subprocess
 *     → Python calls mt5.initialize(login, password, server)
 *     → Python fetches account_info, positions, orders, history
 *     → Python outputs JSON to stdout
 *     → Adapter maps JSON → ProviderSnapshot
 *
 * Security boundary:
 *   - Credentials are decrypted ONLY in this adapter (worker context)
 *   - Credentials are passed to Python subprocess via stdin (NOT env vars or args)
 *   - No credentials appear in logs
 *   - No credentials in ProviderSnapshot output
 *
 * Required environment:
 *   - MT5 terminal installed and logged in on same Windows host
 *   - Python 3.x with MetaTrader5 package installed
 *   - MT5_ENCRYPTION_KEY set (for credential decryption)
 */

import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "child_process";
import { MT5Adapter, AdapterAccountInput, AdapterFetchOptions } from "./adapter";
import { ProviderSnapshot, ProviderName } from "./types";
import { decrypt } from "../encryption";
import { maskLogin } from "./credential-boundary";

export interface Mt5Credentials {
  login: number;
  password: string;
  server: string;
}

export interface Mt5RawAccountInfo {
  login?: number;
  server?: string;
  broker?: string;
  balance?: number;
  equity?: number;
  freeMargin?: number;
  margin?: number;
  marginLevel?: number;
  currency?: string;
  leverage?: number;
  isDemo?: boolean;
  accountType?: number;
  accountCategory?: number;
  deposit?: number;
  credit?: number;
  name?: string;
}

export interface Mt5RawPosition {
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

export interface Mt5RawOrder {
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

export interface Mt5RawHistoryDeal {
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

export interface Mt5RawTerminalInfo {
  connected?: boolean;
  version?: string;
  build?: string;
}

export interface Mt5PythonResult {
  connected?: boolean;
  error?: string | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  message?: string | null;
  accountInfo?: Mt5RawAccountInfo | null;
  positions?: Mt5RawPosition[];
  orders?: Mt5RawOrder[];
  history?: Mt5RawHistoryDeal[];
  terminalInfo?: Mt5RawTerminalInfo;
  timestamp?: number;
  provider?: ProviderName;
  rawOutput?: string;
}

const PYTHON_SCRIPT = `import sys, json, time, os

try:
    import MetaTrader5 as mt5
except ImportError as e:
    print(json.dumps({"error": "MT5_PACKAGE_NOT_FOUND", "message": str(e)}))
    sys.exit(0)

def safe_call(func, *args, **kwargs):
    try:
        return func(*args, **kwargs)
    except Exception as e:
        code = getattr(e, "code", None)
        if code is None and hasattr(mt5, "last_error"):
            err = mt5.last_error()
            code = err[0] if err else None
        return {"__error__": True, "code": code, "message": str(e)}

def safe_dict_result(result):
    if result is None:
        return None
    if isinstance(result, dict):
        return result
    if hasattr(result, "_asdict"):
        return result._asdict()
    try:
        return dict(result)
    except (TypeError, ValueError):
        return {"raw": str(result)}

def main():
    creds_json = sys.stdin.read()
    try:
        creds = json.loads(creds_json)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": "INVALID_CREDENTIALS_FORMAT", "message": str(e)}))
        sys.exit(0)

    login = creds.get("login")
    password = creds.get("password")
    server = creds.get("server")

    if not login or not password or not server:
        print(json.dumps({"error": "MISSING_CREDENTIAL_FIELDS", "message": "login, password, and server are required"}))
        sys.exit(0)

    try:
        login_int = int(login)
    except (ValueError, TypeError):
        print(json.dumps({"error": "INVALID_LOGIN", "message": "login must be an integer"}))
        sys.exit(0)

    # Initialize MT5 connection
    init_result = mt5.initialize(
        login=login_int,
        password=password,
        server=server,
        timeout=10000,
    )

    if not init_result:
        err = mt5.last_error()
        mt5.shutdown()
        print(json.dumps({
            "connected": False,
            "error": "INITIALIZATION_FAILED",
            "errorCode": err[0] if err else None,
            "errorMessage": err[1] if err else "Unknown initialization error",
        }))
        sys.exit(0)

    terminal_info = safe_call(mt5.terminal_info)
    account_info = safe_call(mt5.account_info)

    # Check if account is actually connected
    if account_info is None:
        mt5.shutdown()
        err = mt5.last_error()
        print(json.dumps({
            "connected": False,
            "error": "NO_ACCOUNT_INFO",
            "errorCode": err[0] if err else None,
            "errorMessage": str(err[1]) if err else "Account not available after connection",
        }))
        sys.exit(0)

    ai = safe_dict_result(account_info)

    # Fetch positions
    positions_raw = safe_call(mt5.positions_get)
    positions = []
    if positions_raw and not (isinstance(positions_raw, dict) and positions_raw.get("__error__")):
        for p in positions_raw:
            pd = safe_dict_result(p)
            if pd:
                positions.append({
                    "ticket": pd.get("ticket"),
                    "symbol": pd.get("symbol"),
                    "type": pd.get("type"),
                    "volume": pd.get("volume"),
                    "price": pd.get("price"),
                    "sl": pd.get("sl"),
                    "tp": pd.get("tp"),
                    "profit": pd.get("profit"),
                    "swap": pd.get("swap"),
                    "openTime": pd.get("time"),
                    "comment": pd.get("comment"),
                })

    # Fetch orders
    orders_raw = safe_call(mt5.orders_get)
    orders = []
    if orders_raw and not (isinstance(orders_raw, dict) and orders_raw.get("__error__")):
        for o in orders_raw:
            od = safe_dict_result(o)
            if od:
                orders.append({
                    "ticket": od.get("ticket"),
                    "symbol": od.get("symbol"),
                    "type": od.get("type"),
                    "volume": od.get("volume"),
                    "price": od.get("price"),
                    "sl": od.get("sl"),
                    "tp": od.get("tp"),
                    "state": od.get("state"),
                    "time": od.get("time"),
                    "comment": od.get("comment"),
                })

    # Fetch deal history (last 7 days for daily loss calculations)
    import datetime as dt
    end_date = dt.datetime.now()
    start_date = end_date - dt.timedelta(days=7)
    history_raw = safe_call(mt5.history_deals_get, start_date, end_date)
    history = []
    if history_raw and not (isinstance(history_raw, dict) and history_raw.get("__error__")):
        for h in history_raw:
            hd = safe_dict_result(h)
            if hd:
                history.append({
                    "ticket": hd.get("ticket"),
                    "symbol": hd.get("symbol"),
                    "type": hd.get("type"),
                    "volume": hd.get("volume"),
                    "price": hd.get("price"),
                    "profit": hd.get("profit"),
                    "swap": hd.get("swap"),
                    "commission": hd.get("commission"),
                    "time": hd.get("time"),
                    "reason": hd.get("reason"),
                    "comment": hd.get("comment"),
                })

    ti = safe_dict_result(terminal_info) if terminal_info else {}

    result = {
        "connected": True,
        "accountInfo": {
            "login": ai.get("login"),
            "server": ai.get("server"),
            "broker": ai.get("company"),
            "balance": ai.get("balance"),
            "equity": ai.get("equity"),
            "freeMargin": ai.get("margin_free"),
            "margin": ai.get("margin"),
            "marginLevel": ai.get("margin_level"),
            "currency": ai.get("currency"),
            "leverage": ai.get("leverage"),
            "isDemo": ai.get("trade_mode", 0) == 0,
            "accountType": ai.get("trade_mode"),
            "deposit": ai.get("deposit"),
            "credit": ai.get("credit"),
            "name": ai.get("name"),
        },
        "positions": positions,
        "orders": orders,
        "history": history,
        "terminalInfo": {
            "connected": ti.get("connected") if ti else None,
            "version": ti.get("version") if ti else None,
            "build": str(ti.get("build")) if ti and ti.get("build") else None,
            "serverTime": ti.get("server_time") if ti and isinstance(ti, dict) else None,
        },
        "timestamp": time.time(),
    }

    # Shutdown after data collection
    mt5.shutdown()

    print(json.dumps(result, default=str))

main()
`;

export interface RealAdapterConfig {
  pythonPath?: string;
  scriptTimeoutMs?: number;
}

const DEFAULT_PYTHON_PATH = "python";
const DEFAULT_SCRIPT_TIMEOUT_MS = 15000;

export class RealMT5Adapter extends MT5Adapter {
  readonly providerName = "MT5" as ProviderName;
  private config: Required<RealAdapterConfig>;
  private pythonScript: string;

  constructor(config: RealAdapterConfig = {}) {
    super();
    this.config = {
      pythonPath: config.pythonPath ?? DEFAULT_PYTHON_PATH,
      scriptTimeoutMs: config.scriptTimeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS,
    };
    this.pythonScript = this.buildPythonScript();
  }

  private buildPythonScript(): string {
    return PYTHON_SCRIPT;
  }

  async fetchSnapshot(
    input: AdapterAccountInput,
    options?: AdapterFetchOptions
  ): Promise<ProviderSnapshot> {
    const timeoutMs = options?.timeoutMs ?? this.config.scriptTimeoutMs;
    const credentials = this.decryptCredentials(input.credentials);

    return this.executePythonBridge(credentials, timeoutMs);
  }

  async testConnection(): Promise<{ connected: boolean; message: string }> {
    try {
      const result = await this.executePythonScript(
        JSON.stringify({ login: 0, password: "test", server: "test" }),
        this.config.scriptTimeoutMs,
      );

      if (result.error === "INITIALIZATION_FAILED") {
        const msg = result.errorMessage ?? result.message ?? "Connection failed";
        if (msg.toLowerCase().includes("invalid") || result.errorCode === 4 || result.errorCode === 6) {
          return { connected: false, message: "Invalid credentials" };
        }
        if (result.errorCode === 2) {
          return { connected: false, message: "Terminal not running" };
        }
        return { connected: false, message: sanitizeCredentialMessage(msg) };
      }

      return { connected: true, message: "MT5 terminal connected successfully" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("TIMEOUT")) {
        return { connected: false, message: "Connection timed out" };
      }
      if (msg.includes("ENOENT")) {
        return { connected: false, message: "MT5 terminal not found" };
      }
      return { connected: false, message: sanitizeCredentialMessage(msg) };
    }
  }

  async disconnect(): Promise<void> {
    return;
  }

  private decryptCredentials(encryptedCredentials: string | null | undefined): Mt5Credentials {
    if (!encryptedCredentials) {
      throw new Error("No encrypted credentials provided");
    }

    let decrypted: string;
    try {
      decrypted = decrypt(encryptedCredentials);
    } catch {
      throw new Error("Failed to decrypt MT5 credentials");
    }

    let creds: Record<string, unknown>;
    try {
      creds = JSON.parse(decrypted);
    } catch {
      throw new Error("Credentials are not in expected JSON format");
    }

    const login = Number(creds.login);
    const password = String(creds.password);
    const server = String(creds.server);

    if (!login || !password || !server) {
      throw new Error("Credentials must contain login, password, and server");
    }

    return { login, password, server };
  }

  private async executePythonBridge(
    credentials: Mt5Credentials,
    timeoutMs: number,
  ): Promise<ProviderSnapshot> {
    const credsJson = JSON.stringify(credentials);
    const result = await this.executePythonScript(credsJson, timeoutMs);

    if (result.error) {
      throw this.mapPythonError(result);
    }

    return this.mapToProviderSnapshot(result);
  }

  private async executePythonScript(
    input: string,
    timeoutMs: number,
  ): Promise<Mt5PythonResult> {
    const script = this.pythonScript;

    const startTime = Date.now();

    return new Promise<Mt5PythonResult>((resolve, reject) => {
      let process: ChildProcessWithoutNullStreams;

      try {
        process = spawn(this.config.pythonPath, ["-c", script], {
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
          reject(this.createConnectionError("Failed to spawn Python subprocess"));
          return;
      }

      let stdoutData = "";
      let stderrData = "";

      const timer = setTimeout(() => {
        process.kill("SIGKILL");
        const elapsed = Date.now() - startTime;
        reject({
          code: "PROVIDER_TIMEOUT",
          message: `MT5 bridge timed out after ${elapsed}ms`,
          severity: "HIGH" as const,
          category: "TIMEOUT" as const,
          retryable: "RETRYABLE" as const,
          timeoutMs,
        });
      }, timeoutMs);

      process.stdout.on("data", (data: Buffer) => {
        stdoutData += data.toString();
      });

      process.stderr.on("data", (data: Buffer) => {
        stderrData += data.toString();
      });

      process.on("error", () => {
        clearTimeout(timer);
        reject(this.createConnectionError("Python process error"));
      });

      process.on("exit", (code: number | null) => {
        clearTimeout(timer);

        if (code !== 0) {
          const stderr = stderrData || `Python exited with code ${code}`;
          reject(this.createConnectionError(`Python process exited abnormally: ${stderr}`));
          return;
        }

        try {
          const parsed = JSON.parse(stdoutData.trim());
          resolve(parsed);
        } catch {
          reject({
            code: "VALIDATION_FAILURE",
            message: "Failed to parse Python output as JSON",
            severity: "HIGH" as const,
            category: "VALIDATION" as const,
            retryable: "NON_RETRYABLE" as const,
            rawOutput: stdoutData.substring(0, 200),
          });
        }
      });

      process.stdin?.write(input);
      process.stdin?.end();
    });
  }

  private mapToProviderSnapshot(
    data: Mt5PythonResult,
  ): ProviderSnapshot {
    const ai = data.accountInfo ?? null;

    return {
      accountInfo: ai
        ? {
            login: typeof ai.login === "number" ? ai.login : Number(ai.login) || undefined,
            server: ai.server ?? null,
            broker: ai.broker ?? null,
            balance: typeof ai.balance === "number" ? ai.balance : Number(ai.balance) || null,
            equity: typeof ai.equity === "number" ? ai.equity : Number(ai.equity) || null,
            freeMargin: typeof ai.freeMargin === "number" ? ai.freeMargin : Number(ai.freeMargin) || null,
            margin: typeof ai.margin === "number" ? ai.margin : Number(ai.margin) || null,
            marginLevel: typeof ai.marginLevel === "number" ? ai.marginLevel : Number(ai.marginLevel) || null,
            currency: ai.currency ?? null,
            leverage: typeof ai.leverage === "number" ? ai.leverage : Number(ai.leverage) || null,
            isDemo: typeof ai.isDemo === "boolean" ? ai.isDemo : Boolean(ai.isDemo),
            accountType: typeof ai.accountType === "number" ? ai.accountType : Number(ai.accountType) || null,
            accountCategory: typeof ai.accountCategory === "number" ? ai.accountCategory : Number(ai.accountCategory) || null,
            deposit: typeof ai.deposit === "number" ? ai.deposit : Number(ai.deposit) || null,
            credit: typeof ai.credit === "number" ? ai.credit : Number(ai.credit) || null,
            name: ai.name?.toString() ?? null,
            comment: null,
          }
        : null,
      positions: (data.positions ?? []).map((p: Mt5RawPosition) => ({
        ticket: typeof p.ticket === "number" ? p.ticket : Number(p.ticket) || null,
        symbol: p.symbol ?? null,
        type: typeof p.type === "number" ? p.type : Number(p.type) || null,
        volume: typeof p.volume === "number" ? p.volume : Number(p.volume) || null,
        price: typeof p.price === "number" ? p.price : Number(p.price) || null,
        sl: typeof p.sl === "number" ? p.sl : Number(p.sl) || null,
        tp: typeof p.tp === "number" ? p.tp : Number(p.tp) || null,
        profit: typeof p.profit === "number" ? p.profit : Number(p.profit) || null,
        swap: typeof p.swap === "number" ? p.swap : Number(p.swap) || null,
        openTime: p.openTime ?? null,
        comment: p.comment ?? null,
      })),
      orders: (data.orders ?? []).map((o: Mt5RawOrder) => ({
        ticket: typeof o.ticket === "number" ? o.ticket : Number(o.ticket) || null,
        symbol: o.symbol ?? null,
        type: typeof o.type === "number" ? o.type : Number(o.type) || null,
        volume: typeof o.volume === "number" ? o.volume : Number(o.volume) || null,
        price: typeof o.price === "number" ? o.price : Number(o.price) || null,
        sl: typeof o.sl === "number" ? o.sl : Number(o.sl) || null,
        tp: typeof o.tp === "number" ? o.tp : Number(o.tp) || null,
        state: typeof o.state === "number" ? o.state : Number(o.state) || null,
        time: o.time ?? null,
        comment: o.comment ?? null,
      })),
      history: (data.history ?? []).map((h: Mt5RawHistoryDeal) => ({
        ticket: typeof h.ticket === "number" ? h.ticket : Number(h.ticket) || null,
        symbol: h.symbol ?? null,
        type: typeof h.type === "number" ? h.type : Number(h.type) || null,
        volume: typeof h.volume === "number" ? h.volume : Number(h.volume) || null,
        price: typeof h.price === "number" ? h.price : Number(h.price) || null,
        profit: typeof h.profit === "number" ? h.profit : Number(h.profit) || null,
        swap: typeof h.swap === "number" ? h.swap : Number(h.swap) || null,
        commission: typeof h.commission === "number" ? h.commission : Number(h.commission) || null,
        time: h.time ?? null,
        reason: typeof h.reason === "number" ? h.reason : Number(h.reason) || null,
        comment: h.comment ?? null,
      })),
      terminalInfo: {
        connected: data.terminalInfo?.connected ?? data.connected ?? true,
        version: data.terminalInfo?.version ?? null,
        build: data.terminalInfo?.build ?? null,
      },
      timestamp: data.timestamp ? new Date(data.timestamp * 1000) : new Date(),
      provider: "MT5",
    };
  }

  private mapPythonError(errorData: Mt5PythonResult): Error & {
    code: string;
    severity: string;
    category: string;
    retryable: string;
  } {
    const errorCode: number | null = errorData.errorCode ?? null;
    const errorMsg: string = errorData.errorMessage?.toString() ?? errorData.message ?? "Unknown error";

    const sanitizedMessage = sanitizeCredentialMessage(errorMsg);

    const error = new Error(sanitizedMessage) as Error & {
      code: string;
      severity: string;
      category: string;
      retryable: string;
    };

    error.code = this.mapErrorCode(errorCode, errorData.error ?? null);
    error.severity = this.mapSeverity(error.code);
    error.category = this.mapCategory(error.code);
    error.retryable = this.mapRetryability(error.code);

    return error;
  }

  private mapErrorCode(mt5ErrorCode: number | null, errorField: string | null): string {
    if (mt5ErrorCode === 2 || mt5ErrorCode === 1) {
      return "TERMINAL_NOT_RUNNING";
    }
    if (mt5ErrorCode === 4) {
      return "INVALID_CREDENTIALS";
    }
    if (mt5ErrorCode === 6) {
      return "SERVER_NOT_FOUND";
    }
    if (mt5ErrorCode === 5) {
      return "ACCOUNT_DISABLED";
    }
    if (mt5ErrorCode === 7) {
      return "ACCOUNT_NOT_FOUND";
    }
    if (mt5ErrorCode === 129 || mt5ErrorCode === 64) {
      return "PROVIDER_TIMEOUT";
    }

    if (errorField === "INITIALIZATION_FAILED") return "PROVIDER_UNAVAILABLE";
    if (errorField === "NO_ACCOUNT_INFO") return "UNKNOWN_ACCOUNT";
    if (errorField === "MT5_PACKAGE_NOT_FOUND") return "TERMINAL_NOT_INSTALLED";
    if (errorField === "MISSING_CREDENTIAL_FIELDS") return "INVALID_CREDENTIALS";
    if (errorField === "INVALID_CREDENTIALS_FORMAT") return "INVALID_CREDENTIALS";
    if (errorField === "INVALID_LOGIN") return "INVALID_CREDENTIALS";

    return "PROVIDER_ERROR";
  }

  private mapSeverity(code: string): string {
    if (code === "INVALID_CREDENTIALS" || code === "ACCOUNT_NOT_FOUND" || code === "ACCOUNT_DISABLED" || code === "SERVER_NOT_FOUND") {
      return "CRITICAL";
    }
    if (code === "TERMINAL_NOT_RUNNING" || code === "TERMINAL_NOT_INSTALLED") {
      return "CRITICAL";
    }
    if (code === "PROVIDER_TIMEOUT") {
      return "HIGH";
    }
    return "HIGH";
  }

  private mapCategory(code: string): string {
    if (code === "INVALID_CREDENTIALS") return "AUTHENTICATION";
    if (code === "PROVIDER_TIMEOUT") return "TIMEOUT";
    if (code === "TERMINAL_NOT_RUNNING" || code === "TERMINAL_NOT_INSTALLED" || code === "PROVIDER_UNAVAILABLE") return "CONNECTION";
    if (code === "ACCOUNT_NOT_FOUND" || code === "ACCOUNT_DISABLED" || code === "SERVER_NOT_FOUND" || code === "UNKNOWN_ACCOUNT") return "PROVIDER";
    return "PROVIDER";
  }

  private mapRetryability(code: string): string {
    if (code === "INVALID_CREDENTIALS" || code === "ACCOUNT_NOT_FOUND" || code === "ACCOUNT_DISABLED" || code === "SERVER_NOT_FOUND" || code === "TERMINAL_NOT_INSTALLED") {
      return "NON_RETRYABLE";
    }
    if (code === "PROVIDER_TIMEOUT" || code === "TERMINAL_NOT_RUNNING" || code === "PROVIDER_UNAVAILABLE") {
      return "RETRYABLE";
    }
    return "RETRYABLE";
  }

  private createConnectionError(context: string): Error & {
    code: string;
    severity: string;
    category: string;
    retryable: string;
  } {
    const err = new Error(context) as Error & {
      code: string;
      severity: string;
      category: string;
      retryable: string;
    };
    err.code = "PROVIDER_UNAVAILABLE";
    err.severity = "HIGH";
    err.category = "CONNECTION";
    err.retryable = "RETRYABLE";
    return err;
  }
}

function sanitizeCredentialMessage(message: string): string {
  let sanitized = message;
  sanitized = sanitized.replace(/password[=:]\s*\S+/gi, "password=***REDACTED***");
  sanitized = sanitized.replace(/login[=:]\s*\d+/gi, "login=***REDACTED***");
  sanitized = sanitized.replace(/MT5.*?password/gi, "***REDACTED***");
  return sanitized;
}

export function maskAccountLogin(login: number | string | undefined): string {
  if (login === undefined || login === null) return "[MASKED]";
  const str = String(login);
  if (str.length <= 2) return `[MASKED-${str}***]`;
  return `[MASKED-${str.slice(0, 2)}***]`;
}

export { maskLogin };

export { sanitizeCredentialMessage };
