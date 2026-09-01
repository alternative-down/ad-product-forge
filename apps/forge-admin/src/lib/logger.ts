// apps/forge-admin/src/lib/logger.ts
//
// Lightweight structured logger for the forge-admin frontend. Wraps
// console methods with a stable prefix so logs are easy to filter in dev
// tools and ready to be swapped for a real logger (Sentry, LogRocket, etc.)
// later without changing call sites.
//
// Pattern reference: backend `apps/forge/src/forge-debug.ts` (C12 logger
// module extraction, see Issue 6687 for the analogous Phase 2g backend
// work). The frontend equivalent (Issue 6710) keeps a smaller surface —
// debug/info/warn/error only, no level filtering yet.

const PREFIX = '[forge-admin]';

export const logger = {
  debug: (msg: string, ...args: unknown[]) => console.debug(PREFIX, msg, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(PREFIX, msg, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(PREFIX, msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(PREFIX, msg, ...args),
};
