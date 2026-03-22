import 'dotenv/config';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import { createOAuthGateway } from '@mastra-engine/core';
import { z } from 'zod';

import { getDatabase, runMigrations, seedModelPrices } from './database/index';
import { seedDefaultLlmProfiles } from './database/seed-default-llm-profiles';
import { getInternalAgentRegistry } from './agents/internal-agent-registry';
import { createInternalAgentWorkflows } from './workflows/internal-agents';
import { createForgeHttpServer } from './http/server';
import { createGitHubAppManager } from './github/manager';
import { createAgentEmailManager } from './email/migadu-manager';
import { createCoolifyManager } from './coolify/manager';
import { createAgentScheduleManager } from './schedules/manager';
import { registerAdminRoutes } from './admin/routes';
import { createSystemIntegrationStore } from './system-integrations/store';

const envSchema = z.object({
  FORGE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  FORGE_DATA_PATH: z.string().default('./data'),
  WORKSPACE_BASE_PATH: z.string().default('./workspaces'),
  FORGE_HTTP_PORT: z.coerce.number().int().positive().default(3011),
  FORGE_PUBLIC_BASE_URL: z.string().url().optional(),
  FORGE_ADMIN_API_KEY: z.string().min(1).optional(),
});

export async function main() {
  const env = envSchema.parse(process.env);

  // Load database and agents from registry
  const db = getDatabase();
  await runMigrations(db);
  await seedModelPrices(db);
  await seedDefaultLlmProfiles(db);
  const registry = getInternalAgentRegistry();
  const httpServer = createForgeHttpServer({
    port: env.FORGE_HTTP_PORT,
    adminApiKey: env.FORGE_ADMIN_API_KEY,
  });
  const publicBaseUrl = env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`;
  const integrations = createSystemIntegrationStore(db);

  const emailMailboxes = createAgentEmailManager({
    db,
    integrations,
  });
  const schedules = createAgentScheduleManager({
    db,
    notifyAgent(agentId) {
      const entry = registry.get(agentId);

      if (!entry) {
        return;
      }

      entry.runner.notifyExternalEvent();
    },
  });
  const githubApps = createGitHubAppManager({
    db,
    httpServer,
    publicBaseUrl,
    integrations,
    notifyAgent(agentId) {
      const entry = registry.get(agentId);

      if (!entry) {
        return;
      }

      entry.runner.notifyExternalEvent();
    },
  });
  const coolify = createCoolifyManager({
    integrations,
  });
  const workflows = createInternalAgentWorkflows({
    db,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    githubApps,
    emailMailboxes,
    coolify,
    schedules,
  });
  const loaderConfig = {
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    workflows,
    githubApps,
    coolify,
    schedules,
  };
  registerAdminRoutes({
    db,
    httpServer,
    loaderConfig,
    schedules,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    githubApps,
    emailMailboxes,
    coolify,
    integrations,
  });
  const agents = await registry.loadAll(db, loaderConfig);
  await githubApps.loadAllAgents();
  await schedules.loadAll();
  await httpServer.start();
  console.log(`[Forge] HTTP server listening on ${publicBaseUrl}`);

  new Mastra({
    agents: Object.fromEntries(agents.map(({ runtime }) => [runtime.id, runtime.agent])),
    workflows,
    gateways: {
      oauth: createOAuthGateway(),
    },
    logger: new ConsoleLogger({
      name: 'forge-app',
      level: env.FORGE_LOG_LEVEL ?? 'warn',
    }),
  });

  // Graceful shutdown handlers
  const handleShutdown = (signal: string) => {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    void schedules
      .stop()
      .finally(() => httpServer.stop())
      .finally(() => {
        process.exit(0);
      });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
