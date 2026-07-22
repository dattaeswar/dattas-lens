/**
 * fetch() with automatic retries for transient failures: network drops
 * ("fetch failed" / ECONNRESET), timeouts, and 5xx/429 responses. Each attempt
 * gets a fresh timeout signal. Non-transient responses (2xx-4xx) return as-is.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RetryOpts {
  retries?: number;
  timeoutMs?: number;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOpts = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Retry transient server-side statuses; return everything else.
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      // Network error or timeout — retry with backoff.
      lastErr = err;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Network request failed");
}
