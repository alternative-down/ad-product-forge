// fallow-ignore-file unused-file
export type LogContext = Record<string, unknown>;

function formatLog(level: string, scope: string, message: string, context?: LogContext): string {
  const prefix = `[${level}] [runtime:${scope}]`;
  if (context && Object.keys(context).length > 0) {
    return JSON.stringify({ level, scope, message, ...context });
  }
  return `${prefix} ${message}`;
}

export const logger = {
  debug: (scope: string, message: string, context?: LogContext) =>
    console.log(formatLog('DEBUG', scope, message, context)),
  info: (scope: string, message: string, context?: LogContext) =>
    console.log(formatLog('INFO', scope, message, context)),
  warn: (scope: string, message: string, context?: LogContext) =>
    console.warn(formatLog('WARN', scope, message, context)),
  error: (scope: string, message: string, context?: LogContext) =>
    console.error(formatLog('ERROR', scope, message, context)),
};
