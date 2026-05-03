import 'dotenv/config';
import { forgeDebug } from '@forge-runtime/core';

import { z } from 'zod';

import { getDatabase, runMigrations } from './database/index';
import { getInternalAgentRegistry } from './agents/internal-agent-registry';
import { createForgeHttpServer } from './http/server';
import { createGitHubAppManager } from './github/manager';
import { createAgentEmailManager } from './email/migadu-manager';
import { createCoolifyManager } from './coolify/manager';
import { createMiniMaxManager } from './minimax/manager';
import { createAgentScheduleManager } from './schedules/manager';
import { createAgentPendingSummaryReader } from './agents/pending-summary';
import { registerAdminRoutes } from './admin/routes.js';
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
  const env = envSchema.parse(process.env);

  // Decode admin API key from Base64 if needed (see decodeAdminApiKey JSDoc)
  const adminApiKey = decodeAdminApiKey(env.FORGE_ADMIN_API_KEY);

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
  });
  const publicBaseUrl = env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`;
  const integrations = createSystemIntegrationStore(db);
  const internalChat = createInternalChatService(db);
  const agentContracts = createAgentContractStore(db);

  const emailMailboxes = createAgentEmailManager({
    db,
    integrations,
  });
  const coolifyManager = createCoolifyManager({ db, integrations });
  const minimaxManager = createMiniMaxManager({ integrations });
  const githubApps = createGitHubAppManager({ integrations });

  const schedules = createAgentScheduleManager({
    db,
    registry,
  });
  const pendingSummaryReader = createAgentPendingSummaryReader({ registry });

  const readModel = createAdminReadModel({
    db,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    githubApps,
    internalChat,
  });

  const adminRoutesConfig = {
    httpServer,
    db,
    registry,
    readModel,
    integrations,
    internalChat,
    agentContracts,
    emailMailboxes,
    coolifyManager,
    minimaxManager,
    githubApps,
    schedules,
    pendingSummaryReader,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
  };
  registerAdminRoutes(adminRoutesConfig);

  await httpServer.start();

  forgeDebug({ scope: 'forge-main', level: 'info', message: 'HTTP server listening', context: { publicBaseUrl } });
}