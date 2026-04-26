import { LogLevel, type LogContext } from './logger.js';

// Keep local implementation for now
function isForgeDebugEnabled(): boolean {
  return process.env.FORGE_DEBUG === '1' || process.env.FORGE_DEBUG === 'true';
}

export function forgeDebug(
  scope: string,
  message: string,
  data?: LogContext
): void {
  if (!isForgeDebugEnabled()) return;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: 'DEBUG',
    scope: `forge:${scope}`,
    message,
  };

  if (data && Object.keys(data).length > 0) {
    entry.context = data;
  }

  console.log(JSON.stringify(entry));
}

export { isForgeDebugEnabled };
