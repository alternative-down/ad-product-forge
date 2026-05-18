/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { logger, type LogContext } from './logger.js';

function isForgeDebugEnabled(): boolean {
  return process.env.FORGE_DEBUG === '1' || process.env.FORGE_DEBUG === 'true';
}

interface ForgeDebugOptions {
  scope?: string;
  message: string;
  level?: string;
  context?: LogContext;
  agentId?: string;
  runtimeId?: string;
  [key: string]: unknown;
}

export function forgeDebug(
  scope: string,
  message: string,
  data?: LogContext
): void;
export function forgeDebug(options: ForgeDebugOptions): void;
export function forgeDebug(
  scopeOrOptions: string | ForgeDebugOptions,
  messageOrUndefined?: string,
  data?: LogContext
): void {
  if (!isForgeDebugEnabled()) return;

  let scope: string;
  let message: string;
  let context: LogContext | undefined;

  if (typeof scopeOrOptions === 'object' && scopeOrOptions !== null && !Array.isArray(scopeOrOptions)) {
    const opts = scopeOrOptions as Record<string, unknown>;
    scope = (opts.scope as string) ?? 'unknown';
    message = (opts.message as string) ?? '';

    const { scope: _scope, message: _message, level: _level, context: _context, ...rest } = opts;
    const extra = rest as LogContext;

    if (_context && typeof _context === 'object') {
      context = { ...(_context as LogContext), ...extra };
    } else if (Object.keys(extra).length > 0) {
      context = extra;
    }
  } else {
    scope = scopeOrOptions as string;
    message = messageOrUndefined ?? '';
    context = data;
  }

  logger.debug(scope, message, context);
}

export { isForgeDebugEnabled };