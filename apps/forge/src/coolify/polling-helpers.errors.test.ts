import { describe, expect, test } from 'vitest';
import {
  PollUntilInvalidMaxAttemptsError,
  PollUntilInvalidIntervalError,
  PollUntilAbortedError,
  PollUntilMaxAttemptsReachedError,
  RetryWithBackoffInvalidMaxRetriesError,
  RetryWithBackoffInvalidInitialMsError,
  RetryWithBackoffAbortedError,
} from './polling-helpers.errors';

describe('coolify/polling-helpers.errors', () => {
  describe('PollUntilInvalidMaxAttemptsError', () => {
    test('has expected name, code, and message', () => {
      const err = new PollUntilInvalidMaxAttemptsError(0);
      expect(err.name).toBe('PollUntilInvalidMaxAttemptsError');
      expect(err.code).toBe('POLL_UNTIL_INVALID_MAX_ATTEMPTS');
      expect(err.message).toBe('pollUntil: maxAttempts must be > 0 (got 0)');
      expect(err.maxAttempts).toBe(0);
    });

    test('is instanceof Error and self', () => {
      const err = new PollUntilInvalidMaxAttemptsError(-1);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(PollUntilInvalidMaxAttemptsError);
    });
  });

  describe('PollUntilInvalidIntervalError', () => {
    test('has expected name, code, and message', () => {
      const err = new PollUntilInvalidIntervalError(-100);
      expect(err.name).toBe('PollUntilInvalidIntervalError');
      expect(err.code).toBe('POLL_UNTIL_INVALID_INTERVAL');
      expect(err.message).toBe('pollUntil: intervalMs must be >= 0 (got -100)');
      expect(err.intervalMs).toBe(-100);
    });

    test('is instanceof Error and self', () => {
      const err = new PollUntilInvalidIntervalError(-1);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(PollUntilInvalidIntervalError);
    });
  });

  describe('PollUntilAbortedError', () => {
    test('has expected name, code, and message', () => {
      const err = new PollUntilAbortedError();
      expect(err.name).toBe('PollUntilAbortedError');
      expect(err.code).toBe('POLL_UNTIL_ABORTED');
      expect(err.message).toBe('pollUntil: aborted');
    });

    test('is instanceof Error and self', () => {
      const err = new PollUntilAbortedError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(PollUntilAbortedError);
    });
  });

  describe('PollUntilMaxAttemptsReachedError', () => {
    test('has expected name, code, and message', () => {
      const err = new PollUntilMaxAttemptsReachedError(5, 1000);
      expect(err.name).toBe('PollUntilMaxAttemptsReachedError');
      expect(err.code).toBe('POLL_UNTIL_MAX_ATTEMPTS_REACHED');
      expect(err.message).toBe('pollUntil: max attempts reached (5 attempts in 1000ms)');
      expect(err.maxAttempts).toBe(5);
      expect(err.elapsedMs).toBe(1000);
    });

    test('is instanceof Error and self', () => {
      const err = new PollUntilMaxAttemptsReachedError(1, 100);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(PollUntilMaxAttemptsReachedError);
    });
  });

  describe('RetryWithBackoffInvalidMaxRetriesError', () => {
    test('has expected name, code, and message', () => {
      const err = new RetryWithBackoffInvalidMaxRetriesError(-1);
      expect(err.name).toBe('RetryWithBackoffInvalidMaxRetriesError');
      expect(err.code).toBe('RETRY_WITH_BACKOFF_INVALID_MAX_RETRIES');
      expect(err.message).toBe('retryWithBackoff: maxRetries must be >= 0 (got -1)');
      expect(err.maxRetries).toBe(-1);
    });

    test('is instanceof Error and self', () => {
      const err = new RetryWithBackoffInvalidMaxRetriesError(-1);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(RetryWithBackoffInvalidMaxRetriesError);
    });
  });

  describe('RetryWithBackoffInvalidInitialMsError', () => {
    test('has expected name, code, and message', () => {
      const err = new RetryWithBackoffInvalidInitialMsError(-50);
      expect(err.name).toBe('RetryWithBackoffInvalidInitialMsError');
      expect(err.code).toBe('RETRY_WITH_BACKOFF_INVALID_INITIAL_MS');
      expect(err.message).toBe('retryWithBackoff: initialMs must be >= 0 (got -50)');
      expect(err.initialMs).toBe(-50);
    });

    test('is instanceof Error and self', () => {
      const err = new RetryWithBackoffInvalidInitialMsError(-1);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(RetryWithBackoffInvalidInitialMsError);
    });
  });

  describe('RetryWithBackoffAbortedError', () => {
    test('has expected name, code, and message', () => {
      const err = new RetryWithBackoffAbortedError();
      expect(err.name).toBe('RetryWithBackoffAbortedError');
      expect(err.code).toBe('RETRY_WITH_BACKOFF_ABORTED');
      expect(err.message).toBe('retryWithBackoff: aborted');
    });

    test('is instanceof Error and self', () => {
      const err = new RetryWithBackoffAbortedError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(RetryWithBackoffAbortedError);
    });
  });

  describe('instanceof discrimination', () => {
    test('pollUntil errors are distinct from retryWithBackoff errors', () => {
      const pollErr = new PollUntilAbortedError();
      const retryErr = new RetryWithBackoffAbortedError();
      expect(pollErr).toBeInstanceOf(PollUntilAbortedError);
      expect(pollErr).not.toBeInstanceOf(RetryWithBackoffAbortedError);
      expect(retryErr).toBeInstanceOf(RetryWithBackoffAbortedError);
      expect(retryErr).not.toBeInstanceOf(PollUntilAbortedError);
    });

    test('different pollUntil errors are distinct', () => {
      const a = new PollUntilAbortedError();
      const b = new PollUntilMaxAttemptsReachedError(3, 500);
      expect(a).toBeInstanceOf(PollUntilAbortedError);
      expect(a).not.toBeInstanceOf(PollUntilMaxAttemptsReachedError);
      expect(b).toBeInstanceOf(PollUntilMaxAttemptsReachedError);
      expect(b).not.toBeInstanceOf(PollUntilAbortedError);
    });
  });
});
