/**
 * Cosmos DB throttle retry.
 *
 * Cosmos meters throughput in RUs. When a request exceeds the provisioned rate
 * it does NOT fail permanently — it returns error 16500 (TooManyRequests),
 * which means "ask again shortly". Treating that as an error surfaces a red
 * toast to a team whose flag was perfectly valid.
 *
 * Every write path on the CTF hot path goes through here. Reads are cheap
 * enough to leave alone; it is the burst of writes when thirty teams submit at
 * once that finds the ceiling.
 */

/** Cosmos DB for MongoDB: request rate is large / too many requests. */
export const COSMOS_THROTTLE_CODE = 16500;

interface MongoLikeError {
  code?: number | string;
  /** Cosmos sometimes tells us exactly how long to wait. */
  RetryAfterMs?: number;
  retryAfterMs?: number;
}

function throttleDelayMs(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as MongoLikeError;
  if (Number(e.code) !== COSMOS_THROTTLE_CODE) return null;
  return e.RetryAfterMs ?? e.retryAfterMs ?? 0;
}

export interface ThrottleRetryOptions {
  /** Total attempts including the first. */
  attempts?: number;
  /** Base backoff when Cosmos does not supply RetryAfterMs. */
  baseDelayMs?: number;
}

/**
 * Run `op`, retrying only on 16500. Any other error propagates immediately —
 * a genuine failure must not be hidden behind a retry loop.
 *
 * Backoff honours Cosmos's own RetryAfterMs when present, otherwise doubles
 * from `baseDelayMs`. Jitter is added so thirty replicas retrying the same
 * throttled write do not re-collide in lockstep.
 */
export async function withThrottleRetry<T>(
  op: () => Promise<T>,
  options: ThrottleRetryOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 50;

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      const advised = throttleDelayMs(err);
      if (advised === null) throw err; // Not throttling — a real failure.

      lastError = err;
      if (attempt === attempts - 1) break;

      const backoff = advised > 0 ? advised : baseDelayMs * 2 ** attempt;
      const jitter = Math.random() * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }

  throw lastError;
}
