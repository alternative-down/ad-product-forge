import { z } from 'zod';
import { eq } from 'drizzle-orm';

import type { Database } from '../database/index';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import type { AdminReadModel } from './read-model';
import { loadAgent } from '../agents/agent-loader';
import {
  changeAgentFunctionFromAdmin,
  reloadAgentIfLoaded,
  updateInternalChatProviderProfile,
} from '../capabilities/runtime';
import type { createForgeHttpServer } from '../http/server';
import type { createAgentScheduleManager } from '../schedules/manager';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import { agents, agentProviders, agentFunctions } from '../database/schema';
import { encryptSecret } from '../encryption/crypto';
import { parseProviderCredentials } from '../communication/provider-loader';
import { createId } from '@paralleldrive/cuid2';
import { runInternalHiring, runInternalTermination } from '../agents/internal-agent-lifecycle';
import { topUpActiveAgentContract } from '../agents/top-up-agent-contract';

// Schemas
const agentIdQuerySchema = z.object({
  agentId: z.string().min(1),
});

const agentActionSchema = z.object({
  agentId: z.string().min(1),
});

const topUpAgentContractSchema = z.object({
  agentId: z.string().min(1),
  amountUsd: z.coerce.number().positive(),
});

const hireAgentSchema = z.object({
  hiringRequest: z.string().min(1),
  additionalContext: z.string().optional(),
  weeklyBudgetUsd: z.coerce.number().positive(),
});

const terminateAgentSchema = z.object({
  agentId: z.string().min(1),
});

const changeAgentFunctionSchema = z.object({
  agentId: z.string().min(1),
  functionId: z.string().min(1),
});

const updateAgentConfigSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  instructions: z.string().min(1),
  workspaceAutoSync: z.boolean(),
  workspaceBm25: z.boolean(),
  workspaceEmbedder: z.string().min(1),
});

const upsertAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
  credentials: z.unknown(),
});

const deleteAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
});

type HttpServer = ReturnType<typeof createForgeHttpServer>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseJsonBody<T>(bodyText: string, schema: z.ZodType<T>): T {
  try {
    const parsed = JSON.parse(bodyText);
    return schema.parse(parsed);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export function registerAgentRoutes(input: {
  db: Database;
  httpServer: HttpServer;
  loaderConfig: AgentLoaderConfig;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  readModel: AdminReadModel;
}) {
  // Overview
  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/overview',
    handler: async () => jsonResponse(await input.readModel.getDashboard()),
  });

  // List agents
  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents',
    handler: async () => jsonResponse(await input.readModel.listAgents()),
  });

  // Get single agent
  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({
        agentId: request.query.get('agentId'),
      });
      const agent = await input.db.query.agents.findFirst({
        where: eq(agents.id, agentId),
      });

      if (!agent) {
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      }

      return jsonResponse(agent);
    },
  });

  // Wake agent
  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/overview',
    handler: async () => jsonResponse(await input.readModel.getDashboard()),
  });

  // List agents
  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents',
    handler: async () => jsonResponse(await input.readModel.listAgents()),
  });

  // Get single agent
  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({
        agentId: request.query.get('agentId'),
      });
      const agent = await input.db.query.agents.findFirst({
        where: eq(agents.id, agentId),
      });

      if (!agent) {
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      }

      return jsonResponse(agent);
    },
  });

  // Wake agent
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/wake',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const entry = registry.get(agentId);
      const timestamp = Date.now();

      if (!entry) {
        return jsonResponse({ error: `Loaded agent not found: ${agentId}` }, 404);
      }

      entry.runner.notifyExternalEvent({
        type: 'manual-wake',
        id: `manual-wake:${agentId}:${timestamp}`,
        content: [
          'Manual wake requested from admin console.',
          `Agent id: ${agentId}`,
          `Source: admin-console`,
          `Timestamp: ${new Date(timestamp).toISOString()}`,
        ].join('\n'),
        timestamp,
      });
      return jsonResponse({ success: true });
    },
  });

  // Reload agent
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/reload',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const runtime = await loadAgent(input.db, {
        ...input.loaderConfig,
        agentId,
      });
      await registry.add(input.db, runtime);

      return jsonResponse({ success: true, agentId });
    },
  });

  // Top-up agent contract
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/top-up',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, topUpAgentContractSchema);
      return jsonResponse(await topUpActiveAgentContract(input.db, body));
    },
  });

  // Hire agent
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/hire',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, hireAgentSchema);
      const result = await runInternalHiring(input.db, {
        hiringRequest: body.hiringRequest,
        additionalContext: body.additionalContext,
        weeklyBudgetUsd: body.weeklyBudgetUsd,
        workspaceBasePath: input.workspaceBasePath,
        workflows: input.loaderConfig.workflows,
        githubApps: input.githubApps,
        emailMailboxes: input.emailMailboxes,
        coolify: input.coolify,
        schedules: input.schedules,
      });

      return jsonResponse(result, 201);
    },
  });

  // Terminate agent
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/terminate',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, terminateAgentSchema);
      const result = await runInternalTermination(input.db, {
        agentId: body.agentId,
        workspaceBasePath: input.workspaceBasePath,
        githubApps: input.githubApps,
        emailMailboxes: input.emailMailboxes,
        coolify: input.coolify,
        schedules: input.schedules,
      });

      return jsonResponse(result);
    },
  });

  // Change agent function
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/change-function',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, changeAgentFunctionSchema);
      const result = await changeAgentFunctionFromAdmin({
        db: input.db,
        loaderConfig: input.loaderConfig,
        targetAgentId: body.agentId,
        functionId: body.functionId,
      });

      return jsonResponse(result);
    },
  });

  // Update agent config
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/update-config',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateAgentConfigSchema);
      const agent = await input.db.query.agents.findFirst({
        where: eq(agents.id, body.agentId),
      });

      if (!agent) {
        return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
      }

      await input.db
        .update(agents)
        .set({
          name: body.name,
          description: body.description ?? null,
          instructions: body.instructions,
          workspaceAutoSync: body.workspaceAutoSync ? 1 : 0,
          workspaceBm25: body.workspaceBm25 ? 1 : 0,
          workspaceEmbedder: body.workspaceEmbedder,
          updatedAt: Date.now(),
        })
        .where(eq(agents.id, body.agentId));

      const agentFunction = agent.functionId
        ? await input.db.query.agentFunctions.findFirst({
            where: eq(agentFunctions.id, agent.functionId),
          })
        : null;

      await updateInternalChatProviderProfile(input.db, {
        agentId: body.agentId,
        displayName: body.name,
        description: agentFunction?.description ?? agentFunction?.name ?? body.name,
      });

      await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });

  // Upsert agent provider
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertAgentProviderSchema);
      const credentials = parseProviderCredentials(body.providerType, body.credentials);
      const encryptedCredentials = encryptSecret(JSON.stringify(credentials));
      const existing = await input.db.query.agentProviders.findFirst({
        where: eq(agentProviders.agentId, body.agentId),
      });

      if (existing) {
        await input.db
          .update(agentProviders)
          .set({
            encryptedCredentials,
          })
          .where(eq(agentProviders.id, existing.id));
      } else {
        await input.db.insert(agentProviders).values({
          id: createId(),
          agentId: body.agentId,
          providerType: body.providerType,
          encryptedCredentials,
          createdAt: Date.now(),
        });
      }

      await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

      return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
    },
  });

  // Delete agent provider
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteAgentProviderSchema);

      await input.db
        .delete(agentProviders)
        .where(eq(agentProviders.agentId, body.agentId));

      await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

      return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
    },
  });
}
