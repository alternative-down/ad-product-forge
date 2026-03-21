import 'dotenv/config';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import { createOAuthGateway } from '@mastra-engine/core';
import { z } from 'zod';

import { getDatabase, runMigrations, seedModelPrices } from './database/index.js';
import { getInternalAgentRegistry } from './agents/internal-agent-registry.js';
import { createInternalAgentWorkflows } from './workflows/internal-agents.js';
import { createForgeHttpServer } from './http/server.js';
import { createGitHubAppManager } from './github/manager.js';
import { createAgentEmailManager } from './email/migadu-manager.js';
import { createCoolifyManager } from './coolify/manager.js';
import { createAgentScheduleManager } from './schedules/manager.js';
import { registerAdminRoutes } from './admin/routes.js';

const envSchema = z.object({
  FORGE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  WORKSPACE_BASE_PATH: z.string().default('./workspaces'),
  FORGE_HTTP_PORT: z.coerce.number().int().positive().default(3011),
  FORGE_PUBLIC_BASE_URL: z.string().url().optional(),
  GITHUB_ORGANIZATION: z.string().min(1),
  GITHUB_APP_HOME_URL: z.string().url().optional(),
  MIGADU_API_USER: z.string().email().optional(),
  MIGADU_API_KEY: z.string().min(1).optional(),
  COOLIFY_BASE_URL: z.string().url().optional(),
  COOLIFY_ADMIN_TOKEN: z.string().min(1).optional(),
  COOLIFY_APPLICATIONS_BASE_DOMAIN: z.string().min(1).optional(),
});

export async function main() {
  const env = envSchema.parse(process.env);

  // Load database and agents from registry
  const db = getDatabase();
  await runMigrations(db);
  await seedModelPrices(db);
  const registry = getInternalAgentRegistry();
  const httpServer = createForgeHttpServer({
    port: env.FORGE_HTTP_PORT,
  });
  const publicBaseUrl = env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`;

  if (
    (env.MIGADU_API_USER && !env.MIGADU_API_KEY) ||
    (!env.MIGADU_API_USER && env.MIGADU_API_KEY)
  ) {
    throw new Error('Migadu email provisioning requires both MIGADU_API_USER and MIGADU_API_KEY');
  }

  const hasAnyCoolifyConfig = !!(
    env.COOLIFY_BASE_URL ||
    env.COOLIFY_ADMIN_TOKEN ||
    env.COOLIFY_APPLICATIONS_BASE_DOMAIN
  );
  const hasAllCoolifyConfig = !!(
    env.COOLIFY_BASE_URL &&
    env.COOLIFY_ADMIN_TOKEN &&
    env.COOLIFY_APPLICATIONS_BASE_DOMAIN
  );

  if (hasAnyCoolifyConfig && !hasAllCoolifyConfig) {
    throw new Error(
      'Coolify integration requires COOLIFY_BASE_URL, COOLIFY_ADMIN_TOKEN, and COOLIFY_APPLICATIONS_BASE_DOMAIN',
    );
  }

  const emailMailboxes = createAgentEmailManager({
    db,
    apiUser: env.MIGADU_API_USER ?? null,
    apiKey: env.MIGADU_API_KEY ?? null,
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
    organization: env.GITHUB_ORGANIZATION,
    appHomeUrl: env.GITHUB_APP_HOME_URL ?? publicBaseUrl,
    notifyAgent(agentId) {
      const entry = registry.get(agentId);

      if (!entry) {
        return;
      }

      entry.runner.notifyExternalEvent();
    },
  });
  const coolify = hasAllCoolifyConfig
    ? createCoolifyManager({
        baseUrl: env.COOLIFY_BASE_URL!,
        adminToken: env.COOLIFY_ADMIN_TOKEN!,
        applicationsBaseDomain: env.COOLIFY_APPLICATIONS_BASE_DOMAIN!,
      })
    : null;
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
