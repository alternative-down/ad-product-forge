import 'dotenv/config';
import { forgeDebug } from '@forge-runtime/core';
import { z } from 'zod';

import { getDatabase } from './database/client';
import { runMigrations } from './database/migrate';
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
  FORGE_ADMIN_API_KEY: z.string().min(1).optional(),
  FORGE_ADMIN_ALLOW_INSECURE_LOCAL: z.enum(['true', '1']).optional(),
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

    if (/^[A-Za-z0-9+/]+=*$/.test(trimmed)) {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');

      if (/^[\x20-\x7E]*$/.test(decoded)) {
        return decoded;
      }
    }
  } catch {
    // Fall through to raw value
  }

  return rawValue;
}

/** Normalise value — trim empty strings to undefined *//**
 * Bootstrap Forge: validate env, load DB, create all managers and services.
 * Returns the fully wired application context ready for routes registration.
 */
export async function createForgeBootstrap() {
  const env = envSchema.parse(process.env);

  const adminApiKey = decodeAdminApiKey(env.FORGE_ADMIN_API_KEY);
  const allowInsecureLocal = env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL === 'true'
    || env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL === '1';
  const allowedOrigins = env.FORGE_ADMIN_ALLOWED_ORIGINS
    ? env.FORGE_ADMIN_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : undefined;

  if (!adminApiKey && !allowInsecureLocal) {
    forgeDebug({ scope: 'main', level: 'error', message: 'main: configuration check failed' });
    throw new Error(
      'FORGE_ADMIN_API_KEY is not configured. Set it in your environment or set'
      + ' FORGE_ADMIN_ALLOW_INSECURE_LOCAL=true for local development only.',
    );
  }

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

  const integrations = createSystemIntegrationStore(db);
  const internalChat = createInternalChatService(db);
  const agentContracts = createAgentContractStore(db);

  const coolifyManager = createCoolifyManager({ db, integrations });
  const minimaxManager = createMiniMaxManager({ integrations });
  const githubApps = createGitHubAppManager({ integrations });

  const schedules = createAgentScheduleManager({ db, registry });

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

  const publicBaseUrl = env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`;

  return {
    httpServer,
    readModel,
    integrations,
    githubApps,
    coolifyManager,
    minimaxManager,
    agentContracts,
    schedules,
    db,
    registry,
    internalChat,
    adminApiKey,
    publicBaseUrl,
    allowInsecureLocal,
  };
}
