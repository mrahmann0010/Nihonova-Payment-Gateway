/* --------------------------------------------------------------------------
   One JSON POST. Knows HTTP, not payments.

   Never throws: a network failure or a timeout comes back as a value, so the
   layers above can promise the same. The credential is passed in already
   built and is never put into a returned value or a message.
   -------------------------------------------------------------------------- */

import { daysIn } from "../helpers/dates";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type HttpResult =
  | { kind: "response"; status: number; body: unknown; retryAfterSeconds?: number }
  | { kind: "failure"; timedOut: boolean; message: string };

export async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  authorization: string,
  timeoutMs: number,
): Promise<HttpResult> {
  let response: Response;

  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      // Never followed: a gateway URL that redirects is a config mistake, and
      // the answer is read as one (MISCONFIGURED) in every SDK.
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return {
      kind: "failure",
      timedOut,
      message: timedOut ? `no answer within ${timeoutMs} ms` : describeError(error),
    };
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // Left null. A 5xx with an HTML error page lands here and is still
    // answered by its status.
  }

  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));

  return {
    kind: "response",
    status: response.status,
    body: parsed,
    ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}),
  };
}

const SECONDS = /^[ \t]*([0-9]+(?:\.[0-9]+)?)[ \t]*$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IMF_FIXDATE =
  /^[ \t]*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([0-9]{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT[ \t]*$/;

/**
 * Retry-After: delta-seconds, or an HTTP date in the one format servers must
 * send (IMF-fixdate). Anything else is ignored rather than guessed at, by the
 * same rule in every SDK (vectors/helpers.json → parseRetryAfter).
 */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;

  const seconds = SECONDS.exec(header);
  if (seconds) return Number(seconds[1]);

  const date = IMF_FIXDATE.exec(header);
  if (!date) return undefined;
  const [day, month, year, hour, minute, second] = [
    Number(date[1]),
    MONTHS.indexOf(date[2]!) + 1,
    Number(date[3]),
    Number(date[4]),
    Number(date[5]),
    Number(date[6]),
  ];
  if (day < 1 || day > daysIn(year, month) || hour > 23 || minute > 59 || second > 59) {
    return undefined;
  }
  const at = Date.UTC(year, month - 1, day, hour, minute, second);
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    // undici hides the useful part ("ECONNREFUSED …") in `cause`.
    const cause = (error as Error & { cause?: unknown }).cause;
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    return `${error.message}${detail}`;
  }
  return String(error);
}
