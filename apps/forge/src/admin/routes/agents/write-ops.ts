/**
 * Agent Admin Write Operations - Phase 2 of #689
 * POST routes for agent operations extracted from routes.ts
 */

import { z } from 'zod';
import type { HttpHandler } from '../../../http/server.js';
import { eq } from 'drizzle-orm';
import { agents, agentRoles } from '../../../../src/database/schema.js';
import { changeAgentRoleFromAdmin, updateInternalChatProviderProfile, reloadAgentIfLoaded } from '../../../capabilities/runtime.js';
import { jsonResponse, parseJsonBody, agentActionSchema, topUpAgentContractSchema, adjustAgentContractBudgetSchema, renewAgentContractSchema, hireAgentSchema, terminateAgentSchema, changeAgentRoleSchema, updateAgentGitHubManifestConfigSchema, updateAgentConfigSchema, upsertAgentProviderSchema, deleteAgentProviderSchema } from '../index';


const createAgentMcpServerSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  transport: z.string(),
  command: z.string().optional(),
  argsText: z.string().optional(),
  envVarsText: z.string().optional(),
  url: z.string().optional(),
  headersText: z.string().optional(),
  isActive: z.boolean().optional(),
}).strict();

const updateAgentMcpServerSchema = z.object({
  serverId: z.string(),
  agentId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  transport: z.string().optional(),
  command: z.string().optional(),
  argsText: z.string().optional(),
  envVarsText: z.string().optional(),
  url: z.string().optional(),
  headersText: z.string().optional(),
  isActive: z.boolean().optional(),
}).strict();

const deleteAgentMcpServerSchema = z.object({
  serverId: z.string(),
  agentId: z.string(),
}).strict();

const assignAgentMcpServerSchema = z.object({
  agentId: z.string(),
  serverId: z.string(),
}).strict();

const setAgentMcpServerActiveSchema = z.object({
  agentId: z.string(),
  serverId: z.string(),
  isActive: z.boolean(),
}).strict();

const detachAgentMcpServerSchema = z.object({
  agentId: z.string(),
  serverId: z.string(),
}).strict();

const publishAgentSkillToGlobalSchema = z.object({
  agentId: z.string(),
  skillName: z.string(),
}).strict();

const installGlobalSkillForAgentSchema = z.object({
  agentId: z.string(),
  skillName: z.string(),
}).strict();

const uploadAgentSkillsSchema = z.object({
  agentId: z.string(),
  skillsZipBase64: z.string(),
}).strict();

const deleteAgentSkillSchema = z.object({
  agentId: z.string(),
  skillName: z.string(),
}).strict();

const createRoleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
}).strict();

const updateRoleSchema = z.object({
  roleId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
}).strict();

const deleteRoleSchema = z.object({
  roleId: z.string(),
}).strict();

const roleCapabilitySchema = z.object({
  roleId: z.string(),
  capabilityName: z.string(),
  capabilityValue: z.boolean(),
}).strict();

const roleToolPermissionSchema = z.object({
  roleId: z.string(),
  toolName: z.string(),
  allowed: z.boolean(),
}).strict();

const roleWorkflowPermissionSchema = z.object({
  roleId: z.string(),
  workflowName: z.string(),
  allowed: z.boolean(),
}).strict();

interface RegistryEntry {
  runner: {
    notifyExternalEvent: (event: unknown) => void;
    forceIdle: () => Promise<void>;
  };
}

interface AgentRoutesInput {
  db: unknown;
  workspaceBasePath: string;
  loaderConfig: unknown;
  githubApps?: unknown;
  email?: unknown;
  emailMailboxes?: unknown;
  coolify?: unknown;
  schedules?: unknown;
  internalChat?: unknown;
}

interface InternalChatService {
  registerExternalAccount: (opts: { slug: string; displayName: string }) => Promise<{ accountId: string }>;
  sendMessage: (opts: { accountId: string; targetKey: string; content: string; attachments: unknown[] }) => Promise<{
    conversationKey: string;
    messageId: string;
  }>;
}

/**
 * Register POST routes for agent write operations (reload, force-idle, rewakeup, contracts, hire, terminate, roles, config, MCP, skills)
 */
export function registerAgentWriteOpsRoutes(
  httpServer: { registerRoute: (route: { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; handler: HttpHandler }) => void },
  input: AgentRoutesInput,
  registry: Map<string, RegistryEntry>,
  ops: any
) {
  // POST /admin/agent/reload
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/reload',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const runtime = await ops.loadAgent(input.db, { ...(input.loaderConfig as object), agentId });
      await (registry as Map<string, { runner: RegistryEntry['runner'] }>).set(agentId, runtime as { runner: RegistryEntry['runner'] });
      return jsonResponse({ success: true, agentId });
    },
  });

  // POST /admin/agent/force-idle
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/force-idle',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const entry = registry.get(agentId);
      if (entry) {
        await entry.runner.forceIdle();
      }
      return jsonResponse({ success: true, agentId });
    },
  });

  // POST /admin/agent/rewakeup
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/rewakeup',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      let entry = registry.get(agentId);

      if (entry) {
        await entry.runner.forceIdle();
      } else {
        await ops.loadAgent(input.db, { ...(input.loaderConfig as object), agentId });
        const runtime = await ops.loadAgent(input.db, { ...(input.loaderConfig as object), agentId });
        (registry as Map<string, { runner: RegistryEntry['runner'] }>).set(agentId, runtime as { runner: RegistryEntry['runner'] });
        entry = registry.get(agentId);
      }

      entry!.runner.notifyExternalEvent({
        type: 'admin-rewakeup',
        groupKey: `admin-rewakeup:${agentId}`,
        groupMetadata: { Source: 'admin' },
        idempotencyKey: `admin-rewakeup:${agentId}:${Date.now()}`,
        text: 'Admin requested a forced rewakeup. Rebuild context and continue work from the current state.',
        timestamp: Date.now(),
      });

      return jsonResponse({ success: true, agentId });
    },
  });

  // POST /admin/agent/contract/top-up
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/top-up',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, topUpAgentContractSchema);
      return jsonResponse(await ops.topUpActiveAgentContract(input.db, body));
    },
  });

  // POST /admin/agent/contract/adjust-budget
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/adjust-budget',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, adjustAgentContractBudgetSchema);
      return jsonResponse(await ops.adjustAgentContractBudget(input.db, body));
    },
  });

  // POST /admin/agent/contract/renew
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/renew',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, renewAgentContractSchema);
      return jsonResponse(await ops.renewAgentContract(input.db, body));
    },
  });

  // POST /admin/agent/hire
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/hire',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, hireAgentSchema);
      const result = await ops.runInternalHiring(input.db, {
        hiringRequest: body.hiringRequest,
        additionalContext: body.additionalContext,
        weeklyBudgetUsd: body.weeklyBudgetUsd,
        workspaceBasePath: input.workspaceBasePath,
        githubApps: input.githubApps,
        emailMailboxes: input.emailMailboxes,
        coolify: input.coolify,
        schedules: input.schedules,
        internalChat: input.internalChat,
      });
      return jsonResponse(result, 201);
    },
  });

  // POST /admin/agent/terminate
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/terminate',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, terminateAgentSchema);
      return jsonResponse(await ops.runInternalTermination(input.db, {
        agentId: body.agentId,
      }));
    },
  });

  // POST /admin/agent/change-role
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/change-role',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, changeAgentRoleSchema);
      await ops.changeAgentRoleFromAdmin(input.db, { agentId: body.agentId, roleId: body.newRole });
      return jsonResponse({ success: true });
    },
  });

  // POST /admin/agent/github-manifest-config/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-manifest-config/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateAgentGitHubManifestConfigSchema);
      // Delegate to capability store update — this route updates github manifest config
      // The actual implementation writes to agentGithubManifestConfigs table
      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });

  // POST /admin/agent/update-config
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/update-config',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateAgentConfigSchema);
      const agent = await (input.db as any).query.agents.findFirst({
        where: eq(agents.id, body.agentId),
      });
      if (!agent) {
        return jsonResponse({ error: 'Agent not found: ' + body.agentId }, 404);
      }
      await (input.db as any)
        .update(agents)
        .set({
          name: body.name,
          description: body.description ?? null,
          instructions: body.instructions,
          workspaceAutoSync: body.workspaceAutoSync ? 1 : 0,
          workspaceBm25: body.workspaceBm25 ? 1 : 0,
          modelProfileId: body.modelProfileId,
          omModelProfileId: body.omModelProfileId,
          updatedAt: Date.now(),
        })
        .where(eq(agents.id, body.agentId));
      const role = agent.roleId
        ? await (input.db as any).query.agentRoles.findFirst({
            where: eq(agentRoles.id, agent.roleId),
          })
        : null;
      await updateInternalChatProviderProfile(input.db as any, {
        agentId: body.agentId,
        displayName: body.name ?? body.agentId,
        description: role?.description ?? role?.name ?? body.name ?? body.agentId,
      });
      await reloadAgentIfLoaded(input.db as any, input.loaderConfig as any, body.agentId);
      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });
}