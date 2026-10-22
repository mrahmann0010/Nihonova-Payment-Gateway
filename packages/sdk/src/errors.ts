/**
 * Thrown by `createGatewayClient` when its config is wrong — at boot, so a bad
 * deploy fails before the first checkout instead of during it.
 *
 * This is the only error the SDK throws. Once a client exists, `claim()`
 * never throws: every failure is an outcome.
 */
export class GatewayConfigError extends Error {
  override readonly name = "GatewayConfigError";
}
