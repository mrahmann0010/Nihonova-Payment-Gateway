import { MAX_IDEMPOTENCY_KEY_LENGTH } from "../contract/wire";

/* --------------------------------------------------------------------------
   The idempotency key an order's payment is claimed with.

   `<orderRef>:<attempt>`. The same key is sent on every retry of one attempt
   — a timeout, a not-found poll, a worker restart — so the gateway hands back
   our own earlier claim. A *new* key for the same payment collides with that
   claim and comes back ALREADY_CLAIMED, which looks exactly like someone else
   taking the money.

   The attempt moves on only when the old key can no longer succeed: a gateway
   admin released the claim (RELEASED), or the order now carries a different
   transaction ID. Reopening a cancelled order keeps the key — if it had
   claimed its payment, the claim is still ours, and only the same key gets it
   back.
   -------------------------------------------------------------------------- */

const KEY_PATTERN = /^(.+):(\d+)$/;

export function firstClaimKey(orderRef: string): string {
  return checked(orderRef, `${orderRef}:1`);
}

/**
 * The key to claim with now: the one stored on the order, or the first one
 * for an order that has none yet.
 */
export function claimKeyFor(orderRef: string, storedKey: string | null | undefined): string {
  return storedKey || firstClaimKey(orderRef);
}

/** The key for the next attempt: `SB-10482:1` → `SB-10482:2`. */
export function nextClaimKey(orderRef: string, current: string | null | undefined): string {
  const match = current ? KEY_PATTERN.exec(current) : null;
  const attempt = match && match[1] === orderRef ? Number(match[2]) : 1;
  return checked(orderRef, `${orderRef}:${attempt + 1}`);
}

function checked(orderRef: string, key: string): string {
  if (!orderRef.trim()) throw new Error("A claim key needs an order reference.");
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new Error(
      `Claim key for ${orderRef} would exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
    );
  }
  return key;
}
