import { type LogContext } from './logger.js';

function isForgeDebugEnabled(): boolean {
  return process.env.FORGE_DEBUG === '1' || process.env.FORGE_DEBUG === 'true';
}

interface ForgeDebugOptions {
  scope?: string;
  message: string;
  level?: string;
  data?: LogContext;
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

    const { scope: _scope, message: _message, level: _level, data: _data, ...rest } = opts;
    const extra = rest as LogContext;

    if (_data && typeof _data === 'object') {
      context = { ...(_data as LogContext), ...extra };
    } else if (Object.keys(extra).length > 0) {
      context = extra;
    }
  } else {
    scope = scopeOrOptions as string;
    message = messageOrUndefined ?? '';
    context = data;
  }

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: 'DEBUG',
    scope: `forge:${scope}`,
    message,
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  console.log(JSON.stringify(entry));
}

export { isForgeDebugEnabled };
