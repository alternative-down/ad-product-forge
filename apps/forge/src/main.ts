import 'dotenv/config';
import { forgeDebug } from '@forge-runtime/core';

import { z } from 'zod';

import { getDatabase, runMigrations } from './database/index';
import { getInternalAgentRegistry } from './agents/internal-agent-registry';
import { createForgeHttpServer } from './http/server';
import { createGitHubAppManager } from './github/manager';
import { createMiniMaxManager } from './minimax/manager';
import { createAgentScheduleManager } from './schedules/manager';
import { registerAdminRoutes } from './admin/routes';
import { createAdminReadModel } from './admin/read-model';
import { createSystemIntegrationStore } from './system-integrations/store';
import { createInternalChatService } from './communication/internal-chat-service';
import { createAgentContractStore } from './agents/agent-contract-store';
import { prepareAgentEmbeddersForStartup } from './agents/agent-embedder-maintenance';

const envSchema = z.object({
  FORGE_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FORGE_PUBLIC_BASE_URL: z.string().url().optional(),
  FORGE_DATABASE_URL: z.string().default('sqlite.db'),
  FORGE_ADMIN_API_KEY: z.string().optional(),
  FORGE_ALLOWED_ORIGINS: z.string().default(''),
  FORGE_ALLOW_INSECURE_LOCAL: z.coerce.boolean().default(false),
  FORGE_INSECURE_DISABLED_CSP: z.coerce.boolean().default(false),
});

const rawEnv = {
  FORGE_HTTP_PORT: process.env.FORGE_HTTP_PORT,
  FORGE_PUBLIC_BASE_URL: process.env.FORGE_PUBLIC_BASE_URL,
  FORGE_DATABASE_URL: process.env.FORGE_DATABASE_URL,
  FORGE_ADMIN_API_KEY: process.env.FORGE_ADMIN_API_KEY,
  FORGE_ALLOWED_ORIGINS: process.env.FORGE_ALLOWED_ORIGINS,
  FORGE_ALLOW_INSECURE_LOCAL: process.env.FORGE_ALLOW_INSECURE_LOCAL,
  FORGE_INSECURE_DISABLED_CSP: process.env.FORGE_INSECURE_DISABLED_CSP,
};

const parsed = envSchema.safeParse(rawEnv);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('[forge-main] Invalid env:', parsed.error.format());
  process.exit(1);
}

const env = parsed.data;

async function main() {
  const adminApiKey = env.FORGE_ADMIN_API_KEY;
  const allowInsecureLocal = env.FORGE_ALLOW_INSECURE_LOCAL;
  const allowedOrigins = env.FORGE_ALLOWED_ORIGINS
    ? env.FORGE_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  await runMigrations(env.FORGE_DATABASE_URL);
  const db = getDatabase(env.FORGE_DATABASE_URL);
  const registry = getInternalAgentRegistry();
  const httpServer = createForgeHttpServer({
    databaseUrl: env.FORGE_DATABASE_URL,
    publicBasePath: env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`,
    adminApiKey,
    allowedOrigins,
    agentRegistry: registry,
    disabledCsp: env.FORGE_INSECURE_DISABLED_CSP,
  });
  const publicBaseUrl = env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`;
  const integrations = createSystemIntegrationStore(db);
  const internalChat = createInternalChatService(db);
  const agentContracts = createAgentContractStore(db);

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
    minimaxManager,
    githubApps,
  });

  registerAdminRoutes({
    httpServer,
    readModel,
    integrations,
    githubApps,
    minimaxManager,
    agentContracts,
    schedules,
    db,
  });

  await httpServer.start();
  forgeDebug('forge', `Forge HTTP server started on port ${env.FORGE_HTTP_PORT}`);
  forgeDebug('forge', `Admin API key: ${adminApiKey ? 'configured' : 'NOT configured'}`);
  if (allowInsecureLocal) {
    // eslint-disable-next-line no-console
    console.warn(
      '[forge-main] WARNING: Admin routes served WITHOUT authentication.'
      + ' Set FORGE_ADMIN_API_KEY for production deployments.',
    );
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[forge-main] Received ${signal}, shutting down gracefully...`);
    await httpServer.stop();
    await db.destroy();
    // eslint-disable-next-line no-console
    console.log('[forge-main] Shutdown complete.');
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });

  await prepareAgentEmbeddersForStartup(db);
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[forge-main] Fatal error during startup:', err);
  process.exit(1);
});