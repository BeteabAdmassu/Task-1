const BASE_DELAY_MS = 1000;
const BACKOFF_FACTOR = 4;

/**
 * Returns delay in ms for a given attempt number (1-indexed).
 * Attempt 1 → 1 000 ms
 * Attempt 2 → 4 000 ms
 * Attempt 3 → 16 000 ms
 */
export function exponentialDelay(attempt: number): number {
  return BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes fn with up to maxAttempts retries using exponential backoff.
 * Throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  maxAttempts = 3,
): Promise<{ result: T; attempts: number }> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn(attempt);
      return { result, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        await sleep(exponentialDelay(attempt));
      }
    }
  }
  throw lastError;
}
