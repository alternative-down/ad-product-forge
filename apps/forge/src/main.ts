import 'dotenv/config';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import { createOAuthGateway } from '@mastra-engine/core';
import { z } from 'zod';

import { getDatabase, runMigrations, seedModelPrices } from './database/index';
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
import { createPropagateMessageFn } from './fanout/client';
import { registerFanOutRoutes } from './fanout/routes';

const envSchema = z.object({
  FORGE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  FORGE_DATA_PATH: z.string().default('./data'),
  WORKSPACE_BASE_PATH: z.string().default('./workspaces'),
  FORGE_HTTP_PORT: z.coerce.number().int().positive().default(3011),
  FORGE_PUBLIC_BASE_URL: z.string().url().optional(),
  FORGE_ADMIN_API_KEY: z.string().min(1).optional(),
  FORGE_INSTANCE_ID: z.string().default('default'),
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
    adminApiKey: env.FORGE_ADMIN_API_KEY,
  });
  const publicBaseUrl = env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`;
  const integrations = createSystemIntegrationStore(db);

  const emailMailboxes = createAgentEmailManager({
    db,
    integrations,
  });
  const getAgentPendingSummary = createAgentPendingSummaryReader({
    db,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
  });
  const schedules = createAgentScheduleManager({
    db,
    getAgentPendingSummary,
    notifyAgent(input) {
      const entry = registry.get(input.agentId);

      if (!entry) {
        console.warn(`[Forge] Schedule wake requested for unloaded agent ${input.agentId}`);
        return;
      }

      console.log(`[Forge] Schedule wake requested for agent ${input.agentId}`);
      entry.runner.notifyExternalEvent({
        type: 'schedule',
        id: `schedule:${input.scheduleId}:${input.timestamp}`,
        content: input.content,
        timestamp: input.timestamp,
      });
    },
  });
  const githubApps = createGitHubAppManager({
    db,
    httpServer,
    publicBaseUrl,
    integrations,
    notifyAgent(input) {
      const entry = registry.get(input.agentId);

      if (!entry) {
        console.warn(`[Forge] GitHub wake requested for unloaded agent ${input.agentId}`);
        return;
      }

      console.log(`[Forge] GitHub wake requested for agent ${input.agentId}`);
      entry.runner.notifyExternalEvent({
        type: input.type,
        id: input.id,
        content: input.content,
        timestamp: input.timestamp,
      });
    },
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
  });
  const loaderConfig = {
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    workflows,
    githubApps,
    coolify,
    minimax,
    schedules,
    propagateMessage: createPropagateMessageFn(db, env.FORGE_INSTANCE_ID) as (instanceId: string, message: unknown) => Promise<{ success: boolean; error?: string }>,
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

  // Register fan-out routes for cross-instance message propagation
  registerFanOutRoutes(
    (route) => httpServer.registerRoute(route),
    {
      getInstances: async () => {
        const instances = await db.query.mastraInstances.findMany();
        return instances.map((i) => ({
          id: i.instanceId,
          url: i.baseUrl,
          isHealthy: true, // TODO: implement health checks
        }));
      },
      getParticipantsForConversation: async (conversationId: string) => {
        // Query all agent workspaces for group members
        const allAgents = await db.query.agents.findMany();
        const participants: { participantId: string; participantName: string; instanceId: string | null }[] = [];

        for (const agent of allAgents) {
          const { getGroupMembersFromWorkspace } = await import('./fanout/group-members');
          const members = await getGroupMembersFromWorkspace(
            agent.id,
            env.WORKSPACE_BASE_PATH,
            conversationId
          );
          participants.push(...members);
        }

        return participants;
      },
      deliverMessageToParticipant: async (participantId: string, instanceId: string, message: unknown) => {
        const entry = registry.get(participantId);
        if (!entry) {
          return { success: false, error: `Agent ${participantId} not found` };
        }

        try {
          entry.runner.notifyExternalEvent({
            type: 'message',
            id: `fanout:${Date.now()}`,
            content: typeof message === 'string' ? message : JSON.stringify(message),
            timestamp: Date.now(),
          });
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }
  );

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
