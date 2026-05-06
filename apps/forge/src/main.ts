import 'dotenv/config';
import { forgeDebug } from '@forge-runtime/core';

import { z } from 'zod';

import { getDatabase, runMigrations } from './database/index';
import { getInternalAgentRegistry } from './agents/internal-agent-registry';
import { createForgeHttpServer } from './http/server';
import { createGitHubAppManager } from './github/manager';
import { createCoolifyManager } from './coolify/manager';
import { createMiniMaxManager } from './minimax/manager';
import { createAgentScheduleManager } from './schedules/manager';
import { registerAdminRoutes } from './admin/routes';
import { createAdminReadModel } from './admin/read-model';
import { createSystemIntegrationStore } from './system-integrations/store';
import { createInternalChatService } from './communication/internal-chat-service';
import { createAgentContractStore } from './agents/agent-contract-store';
import { prepareAgentEmbeddersForStartup } from './agents/agent-embedder-maintenance';

const envSchema = z.object({
  FORGE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  FORGE_DATA_PATH: z.string().default('./data'),
  WORKSPACE_BASE_PATH: z.string().default('./workspaces'),
  FORGE_HTTP_PORT: z.coerce.number().int().positive().default(3011),
  FORGE_PUBLIC_BASE_URL: z.string().url().optional(),
  /** Admin API key. Required in production — boot fails without it when
   *  FORGE_ADMIN_ALLOW_INSECURE_LOCAL is not set. */
  FORGE_ADMIN_API_KEY: z.string().min(1).optional(),
  /** Allow /admin/* to be served without authentication (local dev only).
   *  Do NOT set in production. */
  FORGE_ADMIN_ALLOW_INSECURE_LOCAL: z.enum(['true', '1']).optional(),
  /** Comma-separated list of allowed CORS origins for admin routes.
   *  When set, only these origins receive admin API responses.
   *  Example: https://admin.example.com,https://dashboard.example.com */
  FORGE_ADMIN_ALLOWED_ORIGINS: z.string().optional(),
});

/**
 * Decode a Base64-encoded admin API key.
 *
 * Allows keys with special characters (e.g., `$`, `#`, `!`, `\`) to be stored
 * in environment variables safely by Base64-encoding the raw key.
 *
 * Detection logic:
 *   1. If the value is a valid Base64 string (alphanumeric + / + =)
 *      AND decoding produces valid printable UTF-8 output,
 *      the decoded value is used.
 *   2. Otherwise the raw value is returned as-is (backward compatibility).
 *
 * This means:
 *   - Plain ASCII keys like `simple-key` or `abc123` work as-is (no change needed)
 *   - Keys with special chars like `my$ecret!key#123` should be Base64-encoded:
 *       bXkkZWNyZXQha2V5IzEyMw==
 *   - The `$` in the key prevents it from being valid Base64, so the raw value
 *     would be returned by an old server — but since we now always trim empty to
 *     undefined, having a key with `$` in the env without encoding would fail
 *     auth (server gets raw `$` value). Users must Base64-encode keys with
 *     characters outside printable ASCII.
 *
 * Example:
 *   Raw key:    my$ecret!key#123
 *   Base64 env: bXkkZWNyZXQha2V5IzEyMw==
 */
function decodeAdminApiKey(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;

  try {
    const trimmed = rawValue.trim();
    if (trimmed === '') return undefined;

    // Check if it looks like Base64 (alphanumeric + / + = padding)
    if (/^[A-Za-z0-9+/]+=*$/.test(trimmed)) {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');

      // Only use decoded value if it produces valid printable UTF-8.
      // This prevents false positives like `abc123` (valid Base64 but decodes
      // to garbage). Printable ASCII is safe in HTTP headers and proves the
      // encoding intent.
      if (/^[\x20-\x7E]*$/.test(decoded)) {
        return decoded;
      }
    }
  } catch {
    // Fall through to raw value
  }

  return rawValue;
}

export async function main() {
  // Global exception handlers — must be registered before any async work
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[unhandledRejection]', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('[uncaughtException]', error);
  });

  const env = envSchema.parse(process.env);

  // Decode admin API key from Base64 if needed (see decodeAdminApiKey JSDoc)
  const adminApiKey = decodeAdminApiKey(env.FORGE_ADMIN_API_KEY);
  const allowInsecureLocal = env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL === 'true'
    || env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL === '1';
  const allowedOrigins = env.FORGE_ADMIN_ALLOWED_ORIGINS
    ? env.FORGE_ADMIN_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : undefined;

  // Validate: require admin API key unless explicitly opting into insecure local mode
  if (!adminApiKey && !allowInsecureLocal) {
    throw new Error(
      'FORGE_ADMIN_API_KEY is not configured. Set it in your environment or set'
      + ' FORGE_ADMIN_ALLOW_INSECURE_LOCAL=true for local development only.',
    );
  }

  // Load database and agents from registry
  const db = getDatabase();
  await runMigrations(db);
  await prepareAgentEmbeddersForStartup({
    db,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
  });
  const registry = getInternalAgentRegistry();
  const httpServer = createForgeHttpServer({
    port: env.FORGE_HTTP_PORT,
    adminApiKey,
    allowInsecureLocal,
    allowedOrigins,
  });
  const publicBaseUrl = env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`;
  const integrations = createSystemIntegrationStore(db);
  const internalChat = createInternalChatService(db);
  const agentContracts = createAgentContractStore(db);

  const coolifyManager = createCoolifyManager({ db, integrations });
  const minimaxManager = createMiniMaxManager({ integrations });
  const githubApps = createGitHubAppManager({ integrations });

  const schedules = createAgentScheduleManager({
    db,
    registry,
  });

  const readModel = createAdminReadModel({
    db,
    registry,
    integrations,
    internalChat,
    agentContracts,
    schedules,
    coolifyManager,
    minimaxManager,
    githubApps,
  });

  registerAdminRoutes({
    httpServer,
    readModel,
    integrations,
    githubApps,
    coolifyManager,
    minimaxManager,
    agentContracts,
    schedules,
    db,
  });

  await httpServer.start();
  forgeDebug({ scope: 'forge', level: 'info', message: `Forge HTTP server started on port ${env.FORGE_HTTP_PORT}` });
  forgeDebug({ scope: 'forge', level: 'info', message: `Admin API key: ${adminApiKey ? 'configured' : 'NOT configured'}` });
  if (allowInsecureLocal) {
    // eslint-disable-next-line no-console
    console.warn(
      '[forge-main] WARNING: Admin routes served WITHOUT authentication.'
      + ' Set FORGE_ADMIN_API_KEY for production deployments.',
    );
  }

  // Graceful shutdown
  const shutdown = async () => {
    forgeDebug({ scope: 'forge', level: 'info', message: 'Shutting down gracefully...' });
    await httpServer.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[forge-main] Fatal error during startup:', error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    // eslint-disable-next-line no-console
    console.error(error.stack);
  }
  process.exit(1);
});
