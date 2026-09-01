export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL = (process.env.FORGE_LOG_LEVEL as keyof typeof LogLevel | undefined) ?? 'INFO';
const currentLevel = LogLevel[LOG_LEVEL] ?? LogLevel.INFO;

export type LogContext = Record<string, unknown>;

interface LogEntry {
  timestamp: string;
  level: string;
  scope: string;
  message: string;
  context?: LogContext;
}

function formatLog(entry: LogEntry): string {
  if (entry.context && Object.keys(entry.context).length > 0) {
    return JSON.stringify(entry);
  }
  return `[${entry.level}] [forge:${entry.scope}] ${entry.message}`;
}

function log(
  level: LogLevel,
  levelStr: string,
  scope: string,
  message: string,
  context?: LogContext,
) {
  if (level < currentLevel) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: levelStr,
    scope,
    message,
    context,
  };

  const output = formatLog(entry);
  if (level >= LogLevel.ERROR) {
    console.error(output);
  } else if (level >= LogLevel.WARN) {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (scope: string, message: string, context?: LogContext) =>
    log(LogLevel.DEBUG, 'DEBUG', scope, message, context),

  info: (scope: string, message: string, context?: LogContext) =>
    log(LogLevel.INFO, 'INFO', scope, message, context),

  warn: (scope: string, message: string, context?: LogContext) =>
    log(LogLevel.WARN, 'WARN', scope, message, context),

  error: (scope: string, message: string, context?: LogContext) =>
    log(LogLevel.ERROR, 'ERROR', scope, message, context),
};
