/**
 * error-logging.ts
 *
 * Database error logging helpers for store modules.
 *
 * Stores across the codebase repeat the same try/catch + forgeDebug + throw
 * pattern around every DB operation. This file provides a single helper that
 * captures the pattern, keeping the store's business logic visible.
 *
 * No external state — pure function wrapper.
 */

import { errorMsg } from '../agents/error-formatting';
import { forgeDebug } from '@forge-runtime/core';

/**
 * Wraps a DB operation with consistent error logging.
 *
 * On success: returns the operation's result.
 * On failure: logs via forgeDebug (matching the previous try/catch format) and re-throws.
 *
 * The log message format is `${op} DB ${verb} failed` to match the legacy
 * inline pattern. Log consumers should be unchanged.
 *
 * @param params.scope - forgeDebug scope (e.g. 'webhooks-store')
 * @param params.op - operation name (e.g. 'createRoute')
 * @param params.verb - 'read' or 'write', used in the log message
 * @param params.context - structured fields added to the log context
 * @param params.fn - the async DB operation to run
 * @returns the result of params.fn()
 * @throws whatever params.fn() throws, after logging
 *
 * @example
 *   await withDbErrorLogging({
 *     scope: 'webhooks-store',
 *     op: 'createRoute',
 *     verb: 'write',
 *     context: { agentId: input.agentId },
 *     fn: () => db.insert(webhookRoutes).values(route),
 *   });
 */
export async function withDbErrorLogging<T>(params: {
  scope: string;
  op: string;
  verb: 'read' | 'write';
  context: Record<string, unknown>;
  fn: () => Promise<T>;
}): Promise<T> {
  try {
    return await params.fn();
  } catch (err) {
    forgeDebug({
      scope: params.scope,
      level: 'error',
      message: `${params.op} DB ${params.verb} failed`,
      context: { ...params.context, error: errorMsg(err) },
    });
    throw err;
  }
}
