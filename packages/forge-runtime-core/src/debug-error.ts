/**
 * forge-debug — standardized forgeDebug error-logging helpers.
 *
 * Problem: 80+ forgeDebug calls with level='error' are written manually
 * with inconsistent shapes — some pass { error }, others pass a flat context.
 * Additionally, `level: 'error'` inside the object is never actually read by
 * forgeDebug; the logger always logs at 'DEBUG' level regardless of the field.
 *
 * Solution: provide typed helpers that:
 *   1. Accept a typed context (no more `as unknown as` noise)
 *   2. Serialize the Error into a structured context field
 *   3. Expose the logger.error(...) path so callers can choose to emit at
 *      the actual ERROR level instead of silently at DEBUG
 */

import { forgeDebug } from '@forge-runtime/core';
import { logger } from '@forge-runtime/core';

export interface ErrorLogContext extends Record<string, unknown> {
  /** The Error that was caught — serialized to a safe plain-object form */
  error?: unknown;
}

export interface ErrorLogOptions {
  /** Log scope, e.g. 'company-cash-ledger' or 'admin-read-model' */
  scope: string;
  /** Human-readable message, e.g. 'postEntry failed' */
  message: string;
  /** Additional context fields (may include error) */
  context?: ErrorLogContext;
}

/**
 * Log a caught error via forgeDebug at DEBUG level (legacy behaviour).
 * The Error object is serialised into context.error to keep it readable.
 */
export function logErrorViaForgeDebug(opts: ErrorLogOptions): void {
  const context: ErrorLogContext = { ...opts.context };
  forgeDebug({
    scope: opts.scope,
    message: opts.message,
    ...context,
  });
}

/**
 * Log a caught error via logger.error(...) — emits at the configured
 * LOG_LEVEL (defaults to INFO, ERROR entries go to console.error).
 *
 * Use this in modules where errors are truly exceptional
 * and must surface even when FORGE_DEBUG=0.
 */
export function logError(opts: ErrorLogOptions): void {
  const context: ErrorLogContext = {
    ...opts.context,
  };
  logger.error(opts.scope, opts.message, context);
}

/**
 * Wrap a sync or async operation with automatic error logging.
 * Re-throws the original error after logging.
 * Uses logger.error so it always fires regardless of FORGE_DEBUG setting.
 */
export async function withErrorLogging<T>(
  scope: string,
  message: string,
  fn: () => T,
  context?: ErrorLogContext,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.error(scope, message, { ...context, error });
    throw error;
  }
}

/**
 * Sync variant of withErrorLogging for non-async operations.
 */
export function withErrorLoggingSync<T>(
  scope: string,
  message: string,
  fn: () => T,
  context?: ErrorLogContext,
): T {
  try {
    return fn();
  } catch (error) {
    logger.error(scope, message, { ...context, error });
    throw error;
  }
}

/**
 * Helper to serialize an unknown error into a safe object for context.
 * Avoids serializing non-serializable properties.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { value: String(error) };
}