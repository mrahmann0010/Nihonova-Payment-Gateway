/* --------------------------------------------------------------------------
   One JSON POST. Knows HTTP, not payments.

   Never throws: a network failure or a timeout comes back as a value, so the
   layers above can promise the same. The credential is passed in already
   built and is never put into a returned value or a message.
   -------------------------------------------------------------------------- */

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

/** Retry-After is either delta-seconds or an HTTP date. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const at = Date.parse(header);
  if (Number.isNaN(at)) return undefined;
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
