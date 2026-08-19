/**
 * Typed Error subclasses for the coolify/polling-helpers module (Pattern L, D50 #6502 batch 4).
 *
 * Replaces 7 raw `throw new Error(...)` calls in polling-helpers.ts with 7 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Pattern reference: apps/forge/src/agents/global-skills.errors.ts (D50 #6502 batch 3 by Kaelen),
 * apps/forge/src/minimax/errors.ts (D50 #6502 batch 1 by Varek).
 *
 * Migration impact: 7 literal `throw new Error(...)` calls in
 * apps/forge/src/coolify/polling-helpers.ts collapse to 7 typed Error classes.
 * Message format is preserved for backward compatibility with existing tests.
 */

export class PollUntilInvalidMaxAttemptsError extends Error {
  readonly code = 'POLL_UNTIL_INVALID_MAX_ATTEMPTS' as const;
  readonly maxAttempts: number;
  constructor(maxAttempts: number) {
    super(`pollUntil: maxAttempts must be > 0 (got ${maxAttempts})`);
    this.name = 'PollUntilInvalidMaxAttemptsError';
    this.maxAttempts = maxAttempts;
  }
}

export class PollUntilInvalidIntervalError extends Error {
  readonly code = 'POLL_UNTIL_INVALID_INTERVAL' as const;
  readonly intervalMs: number;
  constructor(intervalMs: number) {
    super(`pollUntil: intervalMs must be >= 0 (got ${intervalMs})`);
    this.name = 'PollUntilInvalidIntervalError';
    this.intervalMs = intervalMs;
  }
}

export class PollUntilAbortedError extends Error {
  readonly code = 'POLL_UNTIL_ABORTED' as const;
  constructor() {
    super('pollUntil: aborted');
    this.name = 'PollUntilAbortedError';
  }
}

export class PollUntilMaxAttemptsReachedError extends Error {
  readonly code = 'POLL_UNTIL_MAX_ATTEMPTS_REACHED' as const;
  readonly maxAttempts: number;
  readonly elapsedMs: number;
  constructor(maxAttempts: number, elapsedMs: number) {
    super(
      `pollUntil: max attempts reached (${maxAttempts} attempts in ${elapsedMs}ms)`,
    );
    this.name = 'PollUntilMaxAttemptsReachedError';
    this.maxAttempts = maxAttempts;
    this.elapsedMs = elapsedMs;
  }
}

export class RetryWithBackoffInvalidMaxRetriesError extends Error {
  readonly code = 'RETRY_WITH_BACKOFF_INVALID_MAX_RETRIES' as const;
  readonly maxRetries: number;
  constructor(maxRetries: number) {
    super(`retryWithBackoff: maxRetries must be >= 0 (got ${maxRetries})`);
    this.name = 'RetryWithBackoffInvalidMaxRetriesError';
    this.maxRetries = maxRetries;
  }
}

export class RetryWithBackoffInvalidInitialMsError extends Error {
  readonly code = 'RETRY_WITH_BACKOFF_INVALID_INITIAL_MS' as const;
  readonly initialMs: number;
  constructor(initialMs: number) {
    super(`retryWithBackoff: initialMs must be >= 0 (got ${initialMs})`);
    this.name = 'RetryWithBackoffInvalidInitialMsError';
    this.initialMs = initialMs;
  }
}

export class RetryWithBackoffAbortedError extends Error {
  readonly code = 'RETRY_WITH_BACKOFF_ABORTED' as const;
  constructor() {
    super('retryWithBackoff: aborted');
    this.name = 'RetryWithBackoffAbortedError';
  }
}
