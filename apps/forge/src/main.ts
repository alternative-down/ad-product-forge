import 'dotenv/config';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import { createOAuthGateway } from '@mastra-engine/core';
import { z } from 'zod';

import { getDatabase, runMigrations } from './database/index';
import { getInternalAgentRegistry } from './agents/internal-agent-registry';
import { createInternalAgentWorkflows } from './workflows/internal-agents';
import { createForgeHttpServer } from './http/server';
import { createGitHubAppManager } from './github/manager';
import { createAgentEmailManager } from './email/migadu-manager';
import { createCoolifyManager } from './coolify/manager';
import { createMiniMaxManager } from './minimax/manager';
import { createAgentScheduleManager } from './schedules/manager';
import { createAgentPendingSummaryReader } from './agents/pending-summary';
import { registerAdminRoutes } from './admin/routes';
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

export async function main() {
  const env = envSchema.parse(process.env);

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
    adminApiKey: env.FORGE_ADMIN_API_KEY,
  });
  const publicBaseUrl = env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`;
  const integrations = createSystemIntegrationStore(db);
  const internalChat = createInternalChatService(db, {
    dataRoot: env.FORGE_DATA_PATH,
  });
  const agentContracts = createAgentContractStore(db);

  const emailMailboxes = createAgentEmailManager({
    db,
    integrations,
  });
  const getAgentPendingSummary = createAgentPendingSummaryReader({
    db,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    internalChat,
  });
  const schedules = createAgentScheduleManager({
    db,
    getAgentPendingSummary,
    getAgentExecutionState(agentId) {
      return agentContracts.getExecutionState(agentId);
    },
    notifyAgent(input) {
      const entry = registry.get(input.agentId);

      if (!entry) {
        console.warn(`[Forge] Schedule wake requested for unloaded agent ${input.agentId}`);
        return;
      }

      console.log(`[Forge] Schedule wake requested for agent ${input.agentId}`);
      entry.runner.notifyExternalEvent({
        type: 'schedule',
        groupKey: `schedule:${input.scheduleId}`,
        idleOnly: input.idleOnly,
        groupMetadata: {
          Source: 'scheduler',
          ScheduleId: input.scheduleId,
          ScheduleKind: input.scheduleKind,
          ScheduleName: input.scheduleName,
        },
        idempotencyKey: `schedule:${input.scheduleId}:${input.timestamp}`,
        text: input.content,
        timestamp: input.timestamp,
      });
    },
  });
  const githubApps = createGitHubAppManager({
    db,
    httpServer,
    publicBaseUrl,
    integrations,
  });
  const coolify = createCoolifyManager({
    integrations,
  });
  const minimax = createMiniMaxManager({
    integrations,
  });
  const workflows = createInternalAgentWorkflows({
    db,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    githubApps,
    emailMailboxes,
    coolify,
    schedules,
    internalChat,
  });
  const loaderConfig = {
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    workflows,
    githubApps,
    coolify,
    minimax,
    schedules,
    internalChat,
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
    internalChat,
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
