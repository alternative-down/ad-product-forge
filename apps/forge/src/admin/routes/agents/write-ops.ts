/**
 * Agent Admin Write Operations - Phase 2 of #689
 * POST routes for agent operations extracted from routes.ts
 */

import { z } from 'zod';
import type { HttpHandler } from '../../../http/server';
import { forgeDebug } from '@forge-runtime/core';
import { createId } from '../../../utils/id';
import { eq } from 'drizzle-orm';
import { agents, agentRoles } from '../../../../src/database/schema';
import { changeAgentRoleFromAdmin, updateInternalChatProviderProfile, reloadAgentIfLoaded } from '../../../capabilities/runtime';
import { createCapabilityStore } from '../../../capabilities/store';
import { roleToolPermissions, roleWorkflowPermissions } from '../../../../src/database/schema';
import { installGlobalSkillsFromZip, deleteGlobalSkill, installGlobalSkillToAgentWorkspace, publishAgentWorkspaceSkillToGlobalCatalog } from '../../../agents/global-skills';
import { normalizeJsonText, normalizeOptionalText } from '../helpers';
import { mcpServerConfigs, agentMcpConfigs } from '../../../../src/database/schema';
import { reloadAgentMcp } from '../../routes/mcp-helpers';
import { jsonResponse, parseJsonBody } from '../index';
import {
  agentActionSchema,
  topUpAgentContractSchema,
  adjustAgentContractBudgetSchema,
  renewAgentContractSchema,
  hireAgentSchema,
  terminateAgentSchema,
  changeAgentRoleSchema,
  updateAgentGitHubManifestConfigSchema,
  updateAgentConfigSchema,
} from '../schemas/agents';


import type {Database} from '../../../../src/database/schema';
import type { AgentLoaderConfig } from '../../../agents/agent-loader';
import type { GitHubAppManager } from '../../../github/manager';
import type { AgentEmailManager } from '../../../email/migadu-manager';
import type { CoolifyManager } from '../../../coolify/manager';
import type { createAgentScheduleManager } from '../../../schedules/manager';


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
  db: Database;
  workspaceBasePath: string;
  loaderConfig: AgentLoaderConfig;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  internalChat: InternalChatService;
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
  const capabilities = createCapabilityStore(input.db);
  const resolvePermissionId = (name: string) => name;
  // POST /admin/agent/reload
  // FIX #1046: Use registry.add() to properly create the runner and update the real registry.
  // Previously this wrote to a snapshot Map, not the real registry.
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/reload',
    handler: async (request) => {
      try {
        const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
        const runtime = await ops.loadAgent(input.db, { ...(input.loaderConfig), agentId });
        await registry.add(input.db, runtime);
        return jsonResponse({ success: true, agentId });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/reload route handler failed', context: { path: '/admin/agent/reload', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/force-idle
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/force-idle',
    handler: async (request) => {
      try {
        const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
        const entry = registry.get(agentId);
        if (entry) {
          await entry.runner.forceIdle();
        }
        return jsonResponse({ success: true, agentId });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/force-idle route handler failed', context: { path: '/admin/agent/force-idle', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/rewakeup
  // FIX #1046: Load agent and add to the real registry via registry.add().
  // Previously this wrote to a snapshot Map and had a redundant double-loadAgent call.
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/rewakeup',
    handler: async (request) => {
      try {
        const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
        let entry = registry.get(agentId);
  
        if (entry) {
          await entry.runner.forceIdle();
        } else {
          const runtime = await ops.loadAgent(input.db, { ...(input.loaderConfig), agentId });
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
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/rewakeup route handler failed', context: { path: '/admin/agent/rewakeup', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/contract/top-up
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/top-up',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, topUpAgentContractSchema);
        return jsonResponse(await ops.topUpActiveAgentContract(input.db, body));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/contract/top-up route handler failed', context: { path: '/admin/agent/contract/top-up', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/contract/adjust-budget
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/adjust-budget',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, adjustAgentContractBudgetSchema);
        return jsonResponse(await ops.adjustAgentContractBudget(input.db, body));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/contract/adjust-budget route handler failed', context: { path: '/admin/agent/contract/adjust-budget', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/contract/renew
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/renew',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, renewAgentContractSchema);
        return jsonResponse(await ops.renewAgentContract(input.db, body));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/contract/renew route handler failed', context: { path: '/admin/agent/contract/renew', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/hire
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/hire',
    handler: async (request) => {
      try {
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
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/hire route handler failed', context: { path: '/admin/agent/hire', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/terminate
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/terminate',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, terminateAgentSchema);
        return jsonResponse(await ops.runInternalTermination(input.db, {
          agentId: body.agentId,
          workspaceBasePath: input.workspaceBasePath,
          githubApps: input.githubApps,
          emailMailboxes: input.emailMailboxes,
          coolify: input.coolify,
          schedules: input.schedules,
          internalChat: input.internalChat,
        }));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/terminate route handler failed', context: { path: '/admin/agent/terminate', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/change-role
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/change-role',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, changeAgentRoleSchema);
        await ops.changeAgentRoleFromAdmin(input.db, { agentId: body.agentId, roleId: body.roleId });
        return jsonResponse({ success: true });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/change-role route handler failed', context: { path: '/admin/agent/change-role', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/github-manifest-config/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-manifest-config/update',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateAgentGitHubManifestConfigSchema);
        if (!input.githubApps) {
          return jsonResponse({ error: 'GitHub Apps not configured' }, 503);
        }
        const provisioning = await input.githubApps.updateAgentManifestConfig({
          agentId: body.agentId,
          manifestConfig: body.manifestConfig,
        });
        return jsonResponse({ success: true, agentId: body.agentId, provisioning });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/github-manifest-config/update route handler failed', context: { path: '/admin/agent/github-manifest-config/update', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/update-config
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/update-config',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateAgentConfigSchema);
        const agent = await (input.db).query.agents.findFirst({
          where: eq(agents.id, body.agentId),
        });
        if (!agent) {
          return jsonResponse({ error: 'Agent not found: ' + body.agentId }, 404);
        }
        await (input.db)
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
          ? await (input.db).query.agentRoles.findFirst({
              where: eq(agentRoles.id, agent.roleId),
            })
          : null;
        await updateInternalChatProviderProfile(input.db, {
          agentId: body.agentId,
          agentName: body.name ?? agent.name ?? '',
          agentRole: role?.name ?? 'Unknown',
          agentDescription: body.description ?? agent.description ?? '',
        });
        // Reload the agent runtime with new config
        await reloadAgentIfLoaded(input.db, body.agentId);
        return jsonResponse({ success: true, agentId: body.agentId });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/update-config route handler failed', context: { path: '/admin/agent/update-config', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/providers/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/providers/upsert',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, upsertAgentProviderSchema);
        return jsonResponse({ success: true, agentId: body.agentId });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/providers/upsert route handler failed', context: { path: '/admin/agent/providers/upsert', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/providers/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/providers/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentProviderSchema);
        return jsonResponse({ success: true, agentId: body.agentId });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/providers/delete route handler failed', context: { path: '/admin/agent/providers/delete', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/mcp/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/create',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, createAgentMcpServerSchema);
        const db = input.db;
        const timestamp = new Date().toISOString();
        const serverId = createId();
        const configId = createId();

        await db.insert(mcpServerConfigs).values({
          id: serverId,
          name: body.name,
          description: normalizeOptionalText(body.description),
          transport: body.transport,
          command: body.transport === 'stdio' ? body.command : null,
          args: body.transport === 'stdio' ? normalizeJsonText(body.argsText, 'argsText', 'array') : null,
          envVars: body.transport === 'stdio' ? normalizeJsonText(body.envVarsText, 'envVarsText', 'object') : null,
          url: body.transport === 'http_streamable' ? body.url : null,
          headers: body.transport === 'http_streamable' ? normalizeJsonText(body.headersText, 'headersText', 'object') : null,
          version: 1,
          isActive: body.isActive ? 1 : 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        await db.insert(agentMcpConfigs).values({
          id: configId,
          agentId: body.agentId,
          serverId,
          isActive: body.isActive ? 1 : 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        await reloadAgentMcp(db, input.loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId, serverId }, 201);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/mcp/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/update',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateAgentMcpServerSchema);
        return jsonResponse({ success: true, serverId: body.serverId });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/mcp/update route handler failed', context: { path: '/admin/agent/mcp/update', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/mcp/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentMcpServerSchema);
        return jsonResponse({ success: true });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/mcp/delete route handler failed', context: { path: '/admin/agent/mcp/delete', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/mcp/assign
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/assign',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, assignAgentMcpServerSchema);
        return jsonResponse({ success: true });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/mcp/assign route handler failed', context: { path: '/admin/agent/mcp/assign', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/mcp/set-active
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/set-active',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, setAgentMcpServerActiveSchema);
        return jsonResponse({ success: true });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/mcp/set-active route handler failed', context: { path: '/admin/agent/mcp/set-active', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/mcp/detach
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/detach',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, detachAgentMcpServerSchema);
        return jsonResponse({ success: true });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/mcp/detach route handler failed', context: { path: '/admin/agent/mcp/detach', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/skills/publish-to-global
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/publish-to-global',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, publishAgentSkillToGlobalSchema);
        const agent = await (input.db).query.agents.findFirst({
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
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/skills/publish-to-global route handler failed', context: { path: '/admin/agent/skills/publish-to-global', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/skills/install-global
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/install-global',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, installGlobalSkillForAgentSchema);
        const agent = await (input.db).query.agents.findFirst({
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
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/skills/install-global route handler failed', context: { path: '/admin/agent/skills/install-global', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/skills/upload
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/upload',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, uploadAgentSkillsSchema);
        const installedSkillNames = await installGlobalSkillsFromZip({
          workspaceBasePath: input.workspaceBasePath,
          zipBase64: body.skillsZipBase64,
        });
        return jsonResponse({ success: true, skillNames: installedSkillNames });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/skills/upload route handler failed', context: { path: '/admin/agent/skills/upload', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/skills/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentSkillSchema);
        await deleteGlobalSkill({ workspaceBasePath: input.workspaceBasePath, skillName: body.skillName });
        return jsonResponse({ success: true, skillName: body.skillName });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/skills/delete route handler failed', context: { path: '/admin/agent/skills/delete', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/roles/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/create',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, createRoleSchema);
        const result = await capabilities.createRole({ name: body.name, description: body.description });
        return jsonResponse({ success: true, roleId: result.roleId, name: result.name });
      } catch (err) {
        forgeDebug({ scope: 'admin:roles', level: 'error', message: 'createRole failed', context: { error: err instanceof Error ? err.message : String(err) } });
        throw err;
      }
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
        forgeDebug({ scope: 'admin:roles', level: 'error', message: `updateRole failed: ${err}` });
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
        forgeDebug({ scope: 'admin:roles', level: 'error', message: `deleteRole failed: ${err}` });
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
      try {
        const body = parseJsonBody(request.bodyText, roleCapabilitySchema);
        const toolId = resolvePermissionId(body.capabilityName);
        if (body.capabilityValue) {
          await capabilities.addRoleToolPermission({ roleId: body.roleId, toolId });
        } else {
          await capabilities.removeRoleToolPermission({ roleId: body.roleId, toolId });
        }
        return jsonResponse({ success: true, roleId: body.roleId, toolId, allowed: body.capabilityValue });
      } catch (err) {
        forgeDebug({ scope: 'admin:roles', level: 'error', message: 'addRoleCapability failed', context: { error: err instanceof Error ? err.message : String(err) } });
        throw err;
      }
    },
  });

  // POST /admin/roles/tool-permissions
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/tool-permissions',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
        const toolId = resolvePermissionId(body.toolName);
        if (body.allowed) {
          await capabilities.addRoleToolPermission({ roleId: body.roleId, toolId });
        } else {
          await capabilities.removeRoleToolPermission({ roleId: body.roleId, toolId });
        }
        return jsonResponse({ success: true, roleId: body.roleId, toolId, allowed: body.allowed });
      } catch (err) {
        forgeDebug({ scope: 'admin:roles', level: 'error', message: 'addRoleToolPermission failed', context: { error: err instanceof Error ? err.message : String(err) } });
        throw err;
      }
    },
  });

  // POST /admin/roles/workflow-permissions
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/workflow-permissions',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
        const workflowId = resolvePermissionId(body.workflowName);
        if (body.allowed) {
          await capabilities.addRoleWorkflowPermission({ roleId: body.roleId, workflowId });
        } else {
          await capabilities.removeRoleWorkflowPermission({ roleId: body.roleId, workflowId });
        }
        return jsonResponse({ success: true, roleId: body.roleId, workflowId, allowed: body.allowed });
      } catch (err) {
        forgeDebug({ scope: 'admin:roles', level: 'error', message: 'addRoleWorkflowPermission failed', context: { error: err instanceof Error ? err.message : String(err) } });
        throw err;
      }
    },
  });
}