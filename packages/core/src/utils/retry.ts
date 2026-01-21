import pRetry, { AbortError } from 'p-retry';
import { getLogger } from './logger.js';

export interface RetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
  onFailedAttempt?: (error: Error, attemptNumber: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  retries: 5,
  minTimeout: 1000,
  maxTimeout: 30000,
  factor: 2,
};

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  operationName: string = 'operation'
): Promise<T> {
  const logger = getLogger();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return pRetry(fn, {
    retries: opts.retries,
    minTimeout: opts.minTimeout,
    maxTimeout: opts.maxTimeout,
    factor: opts.factor,
    onFailedAttempt: (error) => {
      const attempt = error.attemptNumber;
      const retriesLeft = error.retriesLeft;
      logger.warn(
        { attempt, retriesLeft, error: error.message },
        `${operationName} failed, retrying...`
      );
      if (opts.onFailedAttempt) {
        opts.onFailedAttempt(error, attempt);
      }
    },
  });
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AbortError) return false;

  // Check for Google API errors
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: number }).code;
    // Rate limit, server errors are retryable
    if (code === 429 || code === 500 || code === 502 || code === 503 || code === 504) {
      return true;
    }
    // Auth errors, not found, etc. are not retryable
    if (code === 401 || code === 403 || code === 404) {
      return false;
    }
  }

  return true;
}

export { AbortError };
