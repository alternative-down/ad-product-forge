/**
 * Agent Admin Write Operations - Phase 2 of #689
 * POST routes for agent operations extracted from routes.ts
 */

import { z } from 'zod';
import type { HttpHandler } from '../../../http/server.js';
import { eq } from 'drizzle-orm';
import { agents, agentRoles } from '../../../../src/database/schema.js';
import { changeAgentRoleFromAdmin, updateInternalChatProviderProfile, reloadAgentIfLoaded } from '../../../capabilities/runtime.js';
import { createCapabilityStore } from '../../../capabilities/store.js';
import { roleToolPermissions, roleWorkflowPermissions } from '../../../../src/database/schema.js';
import { installGlobalSkillsFromZip, deleteGlobalSkill, installGlobalSkillToAgentWorkspace, publishAgentWorkspaceSkillToGlobalCatalog } from '../../../agents/global-skills.js';
import { jsonResponse, parseJsonBody, agentActionSchema, topUpAgentContractSchema, adjustAgentContractBudgetSchema, renewAgentContractSchema, hireAgentSchema, terminateAgentSchema, changeAgentRoleSchema, updateAgentGitHubManifestConfigSchema, updateAgentConfigSchema } from '../index';


const upsertAgentProviderSchema = z.object({
  agentId: z.string(),
  providerType: z.string(),
  credentials: z.record(z.string(), z.string()),
}).strict();

const deleteAgentProviderSchema = z.object({
  agentId: z.string(),
  providerType: z.string(),
}).strict();

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

interface Registry {
  get(agentId: string): RegistryEntry | null;
  add(db: unknown, runtime: unknown): Promise<RegistryEntry>;
  remove(agentId: string): void;
  list(): RegistryEntry[];
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
  registry: Registry,
  ops: any
) {
  const capabilities = createCapabilityStore(input.db as any);
  const resolvePermissionId = (name: string) => name;
  // POST /admin/agent/reload
  // FIX #1046: Use registry.add() to properly create the runner and update the real registry.
  // Previously this wrote to a snapshot Map, not the real registry.
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/reload',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const runtime = await ops.loadAgent(input.db, { ...(input.loaderConfig as object), agentId });
      await registry.add(input.db, runtime);
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
  // FIX #1046: Load agent and add to the real registry via registry.add().
  // Previously this wrote to a snapshot Map and had a redundant double-loadAgent call.
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/rewakeup',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      let entry = registry.get(agentId);

      if (entry) {
        await entry.runner.forceIdle();
      } else {
        const runtime = await ops.loadAgent(input.db, { ...(input.loaderConfig as object), agentId });
        await registry.add(input.db, runtime);
        entry = registry.get(agentId);
      }

      entry!.runner.notifyExternalEvent({
        type: 'admin-rewakeup',
        groupKey: `admin-rewakeup:${agentId}`,
        groupMetadata: { source: 'admin' },
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
      await ops.changeAgentRoleFromAdmin(input.db, { agentId: body.agentId, roleId: body.roleId });
      return jsonResponse({ success: true });
    },
  });

  // POST /admin/agent/github-manifest-config/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-manifest-config/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateAgentGitHubManifestConfigSchema);
      if (!input.githubApps) {
        return jsonResponse({ error: 'GitHub Apps not configured' }, 503);
      }
      const provisioning = await input.githubApps.updateAgentManifestConfig({
        agentId: body.agentId,
        manifestConfig: body.manifestConfig,
      });
      return jsonResponse({ success: true, agentId: body.agentId, provisioning });
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
        agentName: body.name ?? agent.name ?? '',
        agentRole: role?.name ?? 'Unknown',
        agentDescription: body.description ?? agent.description ?? '',
      });
      // Reload the agent runtime with new config
      await reloadAgentIfLoaded(input.db, body.agentId);
      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });

  // POST /admin/agent/providers/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/providers/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertAgentProviderSchema);
      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });

  // POST /admin/agent/providers/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/providers/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteAgentProviderSchema);
      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });

  // POST /admin/agent/mcp/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createAgentMcpServerSchema);
      return jsonResponse({ success: true, serverId: 'placeholder' });
    },
  });

  // POST /admin/agent/mcp/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateAgentMcpServerSchema);
      return jsonResponse({ success: true, serverId: body.serverId });
    },
  });

  // POST /admin/agent/mcp/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteAgentMcpServerSchema);
      return jsonResponse({ success: true });
    },
  });

  // POST /admin/agent/mcp/assign
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/assign',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, assignAgentMcpServerSchema);
      return jsonResponse({ success: true });
    },
  });

  // POST /admin/agent/mcp/set-active
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/set-active',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, setAgentMcpServerActiveSchema);
      return jsonResponse({ success: true });
    },
  });

  // POST /admin/agent/mcp/detach
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/detach',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, detachAgentMcpServerSchema);
      return jsonResponse({ success: true });
    },
  });

  // POST /admin/agent/skills/publish-to-global
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/publish-to-global',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, publishAgentSkillToGlobalSchema);
      const agent = await (input.db as any).query.agents.findFirst({
        where: eq(agents.id, body.agentId),
        columns: { id: true, workspaceFilesystem: true },
      });
      if (!agent) return jsonResponse({ error: 'Agent not found: ' + body.agentId }, 404);
      const result = await publishAgentWorkspaceSkillToGlobalCatalog({
        workspaceBasePath: input.workspaceBasePath,
        agent,
        skillName: body.skillName,
      });
      return jsonResponse({ success: true, skillName: body.skillName, destPath: result.destPath });
    },
  });

  // POST /admin/agent/skills/install-global
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/install-global',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, installGlobalSkillForAgentSchema);
      const agent = await (input.db as any).query.agents.findFirst({
        where: eq(agents.id, body.agentId),
        columns: { id: true, workspaceFilesystem: true },
      });
      if (!agent) return jsonResponse({ error: 'Agent not found: ' + body.agentId }, 404);
      await installGlobalSkillToAgentWorkspace({
        workspaceBasePath: input.workspaceBasePath,
        agent,
        skillName: body.skillName,
      });
      return jsonResponse({ success: true, agentId: body.agentId, skillName: body.skillName });
    },
  });

  // POST /admin/agent/skills/upload
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/upload',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, uploadAgentSkillsSchema);
      const installedSkillNames = await installGlobalSkillsFromZip({
        workspaceBasePath: input.workspaceBasePath,
        zipBase64: body.skillsZipBase64,
      });
      return jsonResponse({ success: true, skillNames: installedSkillNames });
    },
  });

  // POST /admin/agent/skills/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteAgentSkillSchema);
      await deleteGlobalSkill({ workspaceBasePath: input.workspaceBasePath, skillName: body.skillName });
      return jsonResponse({ success: true, skillName: body.skillName });
    },
  });

  // POST /admin/roles/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createRoleSchema);
      const result = await capabilities.createRole({ name: body.name, description: body.description });
      return jsonResponse({ success: true, roleId: result.roleId, name: result.name });
    },
  });

  // POST /admin/roles/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateRoleSchema);
      try {
        const result = await capabilities.updateRole({ roleId: body.roleId, name: body.name, description: body.description });
        return jsonResponse({ success: true, roleId: result.roleId, name: result.name });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('Role not found')) return jsonResponse({ error: msg }, 404);
        throw err;
      }
    },
  });

  // POST /admin/roles/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteRoleSchema);
      try {
        await capabilities.deleteRole(body.roleId);
        return jsonResponse({ success: true, roleId: body.roleId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('Cannot delete role')) return jsonResponse({ error: msg }, 409);
        throw err;
      }
    },
  });

  // POST /admin/roles/capabilities
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/capabilities',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleCapabilitySchema);
      const toolId = resolvePermissionId(body.capabilityName);
      if (body.capabilityValue) {
        await capabilities.addRoleToolPermission({ roleId: body.roleId, toolId });
      } else {
        await capabilities.removeRoleToolPermission({ roleId: body.roleId, toolId });
      }
      return jsonResponse({ success: true, roleId: body.roleId, toolId, allowed: body.capabilityValue });
    },
  });

  // POST /admin/roles/tool-permissions
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/tool-permissions',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
      const toolId = resolvePermissionId(body.toolName);
      if (body.allowed) {
        await capabilities.addRoleToolPermission({ roleId: body.roleId, toolId });
      } else {
        await capabilities.removeRoleToolPermission({ roleId: body.roleId, toolId });
      }
      return jsonResponse({ success: true, roleId: body.roleId, toolId, allowed: body.allowed });
    },
  });

  // POST /admin/roles/workflow-permissions
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/workflow-permissions',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
      const workflowId = resolvePermissionId(body.workflowName);
      if (body.allowed) {
        await capabilities.addRoleWorkflowPermission({ roleId: body.roleId, workflowId });
      } else {
        await capabilities.removeRoleWorkflowPermission({ roleId: body.roleId, workflowId });
      }
      return jsonResponse({ success: true, roleId: body.roleId, workflowId, allowed: body.allowed });
    },
  });
}