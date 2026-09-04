import { z } from 'zod';

/**
 * Centralized env schema for the forge backend.
 *
 * Single source of truth for all env var validation in apps/forge.
 * Closes #6705 (C17 Revisão — configuration management).
 *
 * Replaces 8 scattered `process.env.X` reads across the codebase:
 *   - encryption/crypto.ts          (ENCRYPTION_KEY)
 *   - database/config.ts            (FORGE_DATA_PATH)
 *   - http/server.ts                (FORGE_HTTP_MAX_BODY_BYTES, FORGE_GIT_SHA, FORGE_DEPLOY_TIME)
 *   - main.ts                       (FORGE_HTTP_PORT)
 *   - minimax/manager.ts            (MINIMAX_API_KEY)
 *   - drizzle.config.ts             (DATABASE_URL, DATABASE_AUTH_TOKEN)
 *   - forge-bootstrap.ts            (7 vars, previously inline envSchema)
 *
 * Three exports:
 *   - envSchema:    raw Zod schema (for tests + custom parsing)
 *   - Env:          inferred TypeScript type (for type annotations)
 *   - parseEnv():   memoized parser — parses process.env once, caches result
 *   - __resetEnvCache(): for tests after mutating process.env
 *
 * Lazy + memoized rather than eager module-load evaluation so tests can
 * mutate process.env between cases (vi.resetModules + dynamic import).
 * Production code calls parseEnv() once at module load or app boot.
 */

export const envSchema = z.object({
  // Bootstrap (forge-bootstrap.ts)
  FORGE_DATA_PATH: z.string().default('./data'),
  WORKSPACE_BASE_PATH: z.string().default('./workspaces'),
  FORGE_HTTP_PORT: z.coerce.number().int().positive().default(3011),
  FORGE_PUBLIC_BASE_URL: z.string().url().optional(),
  FORGE_ADMIN_API_KEY: z.string().min(1).optional(),
  FORGE_ADMIN_ALLOW_INSECURE_LOCAL: z.enum(['true', '1']).optional(),
  FORGE_ADMIN_ALLOWED_ORIGINS: z.string().optional(),

  // Server (http/server.ts)
  FORGE_HTTP_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1_048_576), // 1 MB
  FORGE_GIT_SHA: z.string().default('local-dev'),
  FORGE_DEPLOY_TIME: z.string().default('local-dev'),

  // Encryption (encryption/crypto.ts)
  ENCRYPTION_KEY: z.string().optional(),

  // External (minimax/manager.ts)
  MINIMAX_API_KEY: z.string().min(1).optional(),

  // Database (drizzle.config.ts)
  DATABASE_URL: z.string().default('file:./agents.db'),
  DATABASE_AUTH_TOKEN: z.string().optional(),

  // Debug / logging (referenced by forgeDebug + future logger config)
  FORGE_DEBUG: z.enum(['true', 'false', '1', '0']).default('false'),
  FORGE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('warn'),
});

export type Env = z.infer<typeof envSchema>;

let _envCache: Env | undefined;

/**
 * Parse process.env against envSchema, with memoization.
 *
 * The first call parses; subsequent calls return the cached result.
 * Safe to call multiple times across the codebase without re-parsing.
 *
 * Fails fast on invalid env (throws ZodError). Production code should call
 * early so invalid env surfaces at startup, not at first use.
 */
export function parseEnv(): Env {
  if (_envCache === undefined) {
    _envCache = envSchema.parse(process.env);
  }
  return _envCache;
}

/**
 * Clear the memoized env cache. Tests should call this after mutating
 * process.env so the next parseEnv() call re-reads from process.env.
 *
 * Production code should NEVER call this.
 */
export function __resetEnvCache(): void {
  _envCache = undefined;
}
