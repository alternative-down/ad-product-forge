// apps/forge/src/lib/logger.ts
//
// Thin wrapper around the @forge-runtime/core logger that provides a default
// 'forge-app' scope for backend call sites. Mirrors the apps/forge-admin
// frontend logger pattern from PR #6714 (C18 Revisao) but for the Node.js
// backend context.
//
// Usage at call sites:
//
//   import { logger } from '../lib/logger.js';
//   logger.info('HTTP server listening', { port: 3011 });
//   logger.error('Database migration failed', { migration: '0042' });
//
// Why a wrapper (versus importing the runtime logger directly):
//
// 1. Default scope 'forge-app' avoids repeating the scope at every call site.
// 2. Single import path for forge-app code keeps the surface small.
// 3. Keeps the runtime-core logger API intact for other consumers.
// 4. Matches the frontend logger pattern from PR #6714 so the team has
//    one mental model for logging across both apps.
//
// Note: Some production console.* sites in apps/forge intentionally remain
// raw console.* calls because they must always print, even when the logger
// is filtered. See L#NN-Startup-Logging-Failsafe v1 (forge-bootstrap.ts)
// and the uncaughtException plus unhandledRejection handlers in main.ts.

import { logger as runtimeLogger, type LogContext } from '@forge-runtime/core';

const DEFAULT_SCOPE = 'forge-app';

export const logger = {
  debug: (message: string, context?: LogContext): void =>
    runtimeLogger.debug(DEFAULT_SCOPE, message, context),

  info: (message: string, context?: LogContext): void =>
    runtimeLogger.info(DEFAULT_SCOPE, message, context),

  warn: (message: string, context?: LogContext): void =>
    runtimeLogger.warn(DEFAULT_SCOPE, message, context),

  error: (message: string, context?: LogContext): void =>
    runtimeLogger.error(DEFAULT_SCOPE, message, context),
};

// Re-export the runtime logger for cases where a non-default scope is needed
// (for example, a subsystem that wants to log under 'forge-database' or
// 'forge-coolify' rather than the default 'forge-app').
export { runtimeLogger, type LogContext };
