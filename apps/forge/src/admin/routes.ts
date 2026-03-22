import { z } from 'zod';
import { eq, and } from 'drizzle-orm';

import type { Database } from '../database/index.js';
import type { AgentLoaderConfig } from '../agents/agent-loader.js';
import { loadAgent } from '../agents/agent-loader.js';
import { getInternalAgentRegistry } from '../agents/internal-agent-registry.js';
import { createCapabilityStore } from '../capabilities/store.js';
import {
  changeAgentFunctionFromAdmin,
  reloadAgentIfLoaded,
  reloadAgentsForRole,
  updateInternalChatProviderProfile,
} from '../capabilities/runtime.js';
import type { createForgeHttpServer } from '../http/server.js';
import type { createAgentScheduleManager } from '../schedules/manager.js';
import { createAdminReadModel } from './read-model.js';
import { runInternalHiring, runInternalTermination } from '../agents/internal-agent-lifecycle.js';
import type { AgentEmailManager } from '../email/migadu-manager.js';
import type { CoolifyManager } from '../coolify/manager.js';
import type { GitHubAppManager } from '../github/manager.js';
import { agentFunctions, agents, agentProviders } from '../database/schema.js';
import { encryptSecret } from '../encryption/crypto.js';
import { parseProviderCredentials } from '../communication/provider-loader.js';
import { createId } from '@paralleldrive/cuid2';
import { createSystemIntegrationStore } from '../system-integrations/store.js';

const agentIdQuerySchema = z.object({
  agentId: z.string().min(1),
});

const roleToolPermissionSchema = z.object({
  roleId: z.string().min(1),
  toolId: z.string().min(1),
});

const createScheduleSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  scheduleType: z.enum(['cron', 'date']),
  cronExpression: z.string().min(1).optional(),
  scheduledDate: z.string().min(1).optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
});

const updateScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  scheduleType: z.enum(['cron', 'date']).optional(),
  cronExpression: z.string().min(1).optional().nullable(),
  scheduledDate: z.string().min(1).optional().nullable(),
  timezone: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const deleteScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
});

const agentActionSchema = z.object({
  agentId: z.string().min(1),
});

const hireAgentSchema = z.object({
  requestedFunction: z.string().min(1),
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
  workspaceAutoSync: z.boolean(),
  workspaceBm25: z.boolean(),
  workspaceEmbedder: z.string().min(1),
  workspaceFilesystemBasePath: z.string().optional().nullable(),
  workspaceSandboxWorkingDirectory: z.string().optional().nullable(),
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

const systemIntegrationProviderSchema = z.enum(['migadu', 'coolify']);

const upsertSystemIntegrationSchema = z.discriminatedUnion('providerType', [
  z.object({
    providerType: z.literal('migadu'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      apiUser: z.string().email(),
      apiKey: z.string().min(1),
    }),
  }),
  z.object({
    providerType: z.literal('coolify'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      baseUrl: z.string().url(),
      adminToken: z.string().min(1),
      applicationsBaseDomain: z.string().min(1),
    }),
  }),
]);

const deleteSystemIntegrationSchema = z.object({
  providerType: systemIntegrationProviderSchema,
});

export function registerAdminRoutes(input: {
  db: Database;
  httpServer: ReturnType<typeof createForgeHttpServer>;
  loaderConfig: AgentLoaderConfig;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}) {
  const readModel = createAdminReadModel({
    db: input.db,
    workspaceBasePath: input.workspaceBasePath,
  });
  const capabilities = createCapabilityStore(input.db);
  const integrations = input.integrations;
  const registry = getInternalAgentRegistry();

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/overview',
    handler: async () => jsonResponse(await readModel.getDashboard()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents',
    handler: async () => jsonResponse(await readModel.listAgents()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({
        agentId: request.query.get('agentId'),
      });
      const agent = await readModel.getAgent(agentId);

      if (!agent) {
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      }

      return jsonResponse(agent);
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/functions',
    handler: async () => jsonResponse(await readModel.listFunctions()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/roles',
    handler: async () => jsonResponse(await readModel.listRoles()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/integrations',
    handler: async () => jsonResponse(await readModel.listSystemIntegrations()),
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/wake',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const entry = registry.get(agentId);

      if (!entry) {
        return jsonResponse({ error: `Loaded agent not found: ${agentId}` }, 404);
      }

      entry.runner.notifyExternalEvent();
      return jsonResponse({ success: true });
    },
  });

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

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/hire',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, hireAgentSchema);
      const result = await runInternalHiring(input.db, {
        requestedFunction: body.requestedFunction,
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
        schedules: input.schedules,
      });

      return jsonResponse(result);
    },
  });

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
          workspaceAutoSync: body.workspaceAutoSync ? 1 : 0,
          workspaceBm25: body.workspaceBm25 ? 1 : 0,
          workspaceEmbedder: body.workspaceEmbedder,
          workspaceFilesystem: body.workspaceFilesystemBasePath
            ? { basePath: body.workspaceFilesystemBasePath }
            : null,
          workspaceSandbox: body.workspaceSandboxWorkingDirectory
            ? { workingDirectory: body.workspaceSandboxWorkingDirectory }
            : null,
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

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertAgentProviderSchema);
      const credentials = parseProviderCredentials(body.providerType, body.credentials);
      const encryptedCredentials = encryptSecret(JSON.stringify(credentials));
      const existing = await input.db.query.agentProviders.findFirst({
        where: and(
          eq(agentProviders.agentId, body.agentId),
          eq(agentProviders.providerType, body.providerType),
        ),
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

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteAgentProviderSchema);

      await input.db
        .delete(agentProviders)
        .where(
          and(
            eq(agentProviders.agentId, body.agentId),
            eq(agentProviders.providerType, body.providerType),
          ),
        );

      await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

      return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createScheduleSchema);
      const schedule = await input.schedules.createSchedule(body.agentId, body);
      return jsonResponse(schedule, 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateScheduleSchema);
      const schedule = await input.schedules.updateSchedule(body.agentId, body.scheduleId, {
        name: body.name,
        description: body.description,
        scheduleType: body.scheduleType,
        cronExpression: body.cronExpression,
        scheduledDate: body.scheduledDate,
        timezone: body.timezone,
        content: body.content,
        isActive: body.isActive,
      });
      return jsonResponse(schedule);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteScheduleSchema);
      const result = await input.schedules.deleteSchedule(body.agentId, body.scheduleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-tool-permission/add',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
      const result = await capabilities.addRoleToolPermission(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-tool-permission/remove',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
      const result = await capabilities.removeRoleToolPermission(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/integration/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertSystemIntegrationSchema);
      const result =
        body.providerType === 'migadu'
          ? await integrations.upsertIntegration({
              providerType: 'migadu',
              isEnabled: body.isEnabled,
              config: body.config,
            })
          : await integrations.upsertIntegration({
              providerType: 'coolify',
              isEnabled: body.isEnabled,
              config: body.config,
            });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/integration/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteSystemIntegrationSchema);
      await integrations.deleteIntegration(body.providerType);
      return jsonResponse({ success: true, providerType: body.providerType });
    },
  });
}

function parseJsonBody<TSchema extends z.ZodTypeAny>(
  bodyText: string,
  schema: TSchema,
): z.infer<TSchema> {
  const parsed = bodyText.trim().length === 0 ? {} : JSON.parse(bodyText);
  return schema.parse(parsed);
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}
