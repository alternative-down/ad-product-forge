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
  const internalChat = createInternalChatService(db);
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
        forgeDebug({ scope: 'forge-main', level: 'warn', message: 'Schedule wake requested for unloaded agent', context: { agentId: input.agentId, scheduleId: input.scheduleId } });
        return;
      }

      forgeDebug({ scope: 'forge-main', level: 'info', message: 'Schedule wake requested for agent', context: { agentId: input.agentId, scheduleId: input.scheduleId } });
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
  const loaderConfig = {
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    githubApps,
    emailMailboxes,
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
  forgeDebug({ scope: 'forge-main', level: 'info', message: 'HTTP server listening', context: { publicBaseUrl } });

  // Graceful shutdown handlers
  const handleShutdown = (signal: string) => {
    forgeDebug({ scope: 'forge-main', level: 'info', message: 'Shutting down gracefully', context: { signal } });
    void schedules
      .stop()
      .finally(() => httpServer.stop())
      .finally(() => {
        process.exit(0);
      });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    forgeDebug({
      scope: 'forge-main',
      level: 'error',
      message: 'Unhandled promise rejection',
      context: { reason: reason instanceof Error ? reason.message : String(reason) },
    });
    process.exitCode = 1;
  });

  process.on('unhandledException', (error) => {
    forgeDebug({
      scope: 'forge-main',
      level: 'error',
      message: 'Unhandled exception',
      context: { error: error instanceof Error ? error.message : String(error) },
    });
    process.exitCode = 1;
  });
}

main().catch((error) => {
  forgeDebug({ scope: 'forge-main', level: 'error', message: 'Fatal error', context: { error: error instanceof Error ? error.message : String(error) } });
  process.exitCode = 1;
});
