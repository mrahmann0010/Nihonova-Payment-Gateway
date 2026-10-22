import { type GatewayClientConfig, resolveConfig } from "./config";
import { GatewayConfigError } from "./errors";
import { type ClaimsResource, createClaimsResource } from "./resources/claims/claims";
import { postJson } from "./transport/http";
import { type RetryDeps, defaultRetryDeps } from "./transport/retry";

export type GatewayClient = {
  /** False when the config was left empty: every claim is UNAVAILABLE. */
  readonly enabled: boolean;
  /** The configured client ID, for logs. Never the secret. */
  readonly clientId: string | undefined;
  readonly claims: ClaimsResource;
};

/** Seams for the SDK's own tests. Not part of the public contract. */
export type GatewayClientInternals = { retryDeps?: RetryDeps };

/**
 * Build the client once at boot and share it; it holds no per-request state.
 *
 * Throws GatewayConfigError on a bad config, and refuses to run in a browser:
 * the secret is a payment credential and must never be shipped to one.
 */
export function createGatewayClient(
  config: GatewayClientConfig,
  internals: GatewayClientInternals = {},
): GatewayClient {
  assertServerSide();

  const resolved = resolveConfig(config);

  if (!resolved.enabled) {
    return Object.freeze({
      enabled: false,
      clientId: undefined,
      claims: createClaimsResource({ enabled: false, logger: resolved.logger }),
    });
  }

  // The credential lives only in this closure — not on the returned object —
  // so logging or serialising the client cannot print it.
  const { authorization, claimsUrl, fetch: fetchImpl } = resolved;

  const claims = createClaimsResource({
    enabled: true,
    logger: resolved.logger,
    policy: resolved.policy,
    retryDeps: internals.retryDeps ?? defaultRetryDeps,
    post: (body, timeoutMs) => postJson(fetchImpl, claimsUrl, body, authorization, timeoutMs),
  });

  return Object.freeze({ enabled: true, clientId: resolved.clientId, claims });
}

function assertServerSide(): void {
  const g = globalThis as { window?: unknown; document?: unknown };
  if (typeof g.window !== "undefined" && typeof g.document !== "undefined") {
    throw new GatewayConfigError(
      "@sakura/pay is server-side only: its secret must never reach a browser.",
    );
  }
}
