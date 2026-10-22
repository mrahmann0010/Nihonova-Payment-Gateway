import { GatewayConfigError } from "./errors";
import type { GatewayLogger } from "./logger";
import { silentLogger } from "./logger";
import type { FetchLike } from "./transport/http";
import type { RetryPolicy } from "./transport/retry";

export type GatewayClientConfig = {
  /**
   * The gateway's API origin, e.g. `https://pay.example.com`. HTTPS, except
   * for localhost during development.
   *
   * `baseUrl`, `clientId` and `secret` are all-or-none: pass all three, or
   * leave all three empty for an environment with no gateway (every claim is
   * then UNAVAILABLE — never a grant). Half a config throws.
   */
  baseUrl: string | undefined;
  /** The client ID registered on the gateway's Businesses page. */
  clientId: string | undefined;
  /** That client's secret. Server-side only. */
  secret: string | undefined;

  /** Per attempt. Default 5000. */
  timeoutMs?: number;
  /** For one `claim()` call, retries included. Default 8000. */
  totalBudgetMs?: number;
  /** In-call retries on network errors, timeouts and 5xx. Default 1. */
  maxRetries?: number;

  logger?: GatewayLogger;
  /** Defaults to the global `fetch`. Inject for proxies or tests. */
  fetch?: FetchLike;
};

export type ResolvedConfig =
  | { enabled: false; logger: GatewayLogger }
  | {
      enabled: true;
      claimsUrl: string;
      clientId: string;
      authorization: string;
      policy: RetryPolicy;
      logger: GatewayLogger;
      fetch: FetchLike;
    };

export const DEFAULTS = { timeoutMs: 5_000, totalBudgetMs: 8_000, maxRetries: 1 } as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Check the config once, at construction. Every problem found here is a
 * deploy mistake, so it throws — failing the boot rather than the first
 * customer's checkout.
 */
export function resolveConfig(config: GatewayClientConfig): ResolvedConfig {
  if (!config || typeof config !== "object") {
    throw new GatewayConfigError("createGatewayClient needs a config object.");
  }

  const logger = config.logger ?? silentLogger;
  const baseUrl = blankToUndefined(config.baseUrl);
  const clientId = blankToUndefined(config.clientId);
  const secret = blankToUndefined(config.secret);

  const given = [baseUrl, clientId, secret].filter(Boolean).length;
  if (given === 0) return { enabled: false, logger };
  if (given < 3) {
    const missing = (
      [
        ["baseUrl", baseUrl],
        ["clientId", clientId],
        ["secret", secret],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name);
    throw new GatewayConfigError(
      `Payment gateway config is incomplete: missing ${missing.join(", ")}. Set all three or none.`,
    );
  }

  const url = parseBaseUrl(baseUrl!);

  // The credential is `<clientId>.<secret>` and the server splits on the FIRST
  // dot, so a dot inside the client ID would send the wrong credential.
  if (clientId!.includes(".")) {
    throw new GatewayConfigError("Payment gateway clientId must not contain a dot.");
  }

  const fetchImpl = config.fetch ?? (globalThis.fetch as FetchLike | undefined);
  if (typeof fetchImpl !== "function") {
    throw new GatewayConfigError("No fetch available. Use Node 18+ or pass `fetch` in the config.");
  }

  return {
    enabled: true,
    claimsUrl: `${url}/v1/claims`,
    clientId: clientId!,
    authorization: `Bearer ${clientId}.${secret}`,
    policy: {
      timeoutMs: positive("timeoutMs", config.timeoutMs, DEFAULTS.timeoutMs),
      totalBudgetMs: positive("totalBudgetMs", config.totalBudgetMs, DEFAULTS.totalBudgetMs),
      maxRetries: nonNegativeInt("maxRetries", config.maxRetries, DEFAULTS.maxRetries),
    },
    logger,
    fetch: fetchImpl,
  };
}

function parseBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GatewayConfigError(`Payment gateway baseUrl is not a URL: ${raw}`);
  }

  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new GatewayConfigError(
      "Payment gateway baseUrl must use https (plain http is allowed only for localhost).",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new GatewayConfigError(
      "Payment gateway baseUrl must be a plain origin/path, without credentials, query or fragment.",
    );
  }

  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : undefined;
  return trimmed ? trimmed : undefined;
}

function positive(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new GatewayConfigError(`Payment gateway ${name} must be a positive number.`);
  }
  return value;
}

function nonNegativeInt(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new GatewayConfigError(`Payment gateway ${name} must be a whole number ≥ 0.`);
  }
  return value;
}
