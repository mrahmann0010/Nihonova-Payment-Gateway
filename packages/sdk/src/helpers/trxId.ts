/**
 * The one form two receipts are compared in: uppercase, with every
 * non-alphanumeric character removed.
 *
 * The same rule as apps/server/src/services/trxId.js — and sakura-book's
 * `normaliseTransactionId`. Exported so an app's own "is this receipt already
 * used in *our* orders?" check compares IDs the way the gateway does. If the
 * rule ever changes, all three change together.
 */
export function normaliseTrxId(value: unknown): string {
  return String(value ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}
