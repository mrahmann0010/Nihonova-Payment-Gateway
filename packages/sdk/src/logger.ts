/**
 * Where the SDK reports answers that mean something is wrong: a refused
 * credential, a malformed request, a reply outside the contract. `console`
 * and a NestJS `Logger` both fit. Nothing is logged by default — a library
 * should not write to an app's output unasked.
 *
 * Messages never contain the secret.
 */
export type GatewayLogger = {
  error(message: string): void;
  warn?(message: string): void;
};

export const silentLogger: GatewayLogger = { error: () => {} };
