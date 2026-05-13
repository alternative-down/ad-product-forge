import { z } from 'zod';
import type { HttpHandler } from '../../../http/server';
import { forgeDebug } from '../debug';
import { createId } from '../../../utils/id';
import { and, eq } from 'drizzle-orm';
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
import { registerLifecycleOps } from './_split/lifecycle-ops';
import { registerContractOps } from './_split/contract-ops';
import { Database } from '../../../../src/database/schema';
import { AgentLoaderConfig } from '../../../agents/agent-loader';
import { GitHubAppManager } from '../../../github/manager';
import { AgentEmailManager } from '../../../email/migadu-manager';
import { CoolifyManager } from '../../../coolify/manager';
import { createAgentScheduleManager } from '../../../schedules/manager';
import {
  upsertAgentProviderSchema,
  deleteAgentProviderSchema,
  createAgentMcpServerSchema,
  updateAgentMcpServerSchema,
  deleteAgentMcpServerSchema,
  assignAgentMcpServerSchema,
  setAgentMcpServerActiveSchema,
  detachAgentMcpServerSchema,
  publishAgentSkillToGlobalSchema,
  installGlobalSkillForAgentSchema,
  uploadAgentSkillsSchema,
  deleteAgentSkillSchema,
  roleCreateSchema,
  roleUpdateSchema,
  roleDeleteSchema,
  roleCapabilitiesSchema,
  roleToolPermissionsSchema,
  roleWorkflowPermissionsSchema,
} from './_split/write-ops/write-ops-schemas';

/**
 * Register POST routes for agent write operations (reload, force-idle, rewakeup, contracts, hire, terminate, roles, config, MCP, skills)
 */
export function registerAgentWriteOpsRoutes(
  httpServer: { registerRoute: (route: { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; handler: HttpHandler }) => void },
  input: {
    db: Database;
    workspaceBasePath: string;
    loaderConfig: AgentLoaderConfig;
    githubApps: GitHubAppManager;
    emailMailboxes: AgentEmailManager | null;
    coolify: CoolifyManager | null;
    schedules: ReturnType<typeof createAgentScheduleManager>;
    internalChat: InternalChatService;
  },
  registry: {
    get(agentId: string): unknown;
    add(db: unknown, runtime: unknown): Promise<unknown>;
    remove(agentId: string): void;
    list(): unknown[];
  },
  ops: unknown,
) {
  const capabilities = createCapabilityStore(input.db);
  const resolvePermissionId = (name: string) => name;
  // Lifecycle ops — extracted to _split/lifecycle-ops.ts
  registerLifecycleOps(httpServer, input, ops);
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
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await db.insert(agentMcpConfigs).values({
          id: configId,
          agentId: body.agentId,
          serverId,
          isActive: body.isActive ? 1 : 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await reloadAgentMcp(db, input.loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId, serverId }, 201);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/agent/mcp/create', context: { error: error instanceof Error ? error.message : String(error) } });
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
        const updates: Record<string, unknown> = {};
        if (body.name !== undefined) updates.name = body.name;
        if (body.description !== undefined) updates.description = normalizeOptionalText(body.description);
        if (body.transport !== undefined) updates.transport = body.transport;
        if (body.command !== undefined) updates.command = body.transport === 'stdio' ? body.command : null;
        if (body.argsText !== undefined) updates.args = body.transport === 'stdio' ? normalizeJsonText(body.argsText, 'argsText', 'array') : null;
        if (body.envVarsText !== undefined) updates.envVars = body.transport === 'stdio' ? normalizeJsonText(body.envVarsText, 'envVarsText', 'object') : null;
        if (body.url !== undefined) updates.url = body.transport === 'http_streamable' ? body.url : null;
        if (body.headersText !== undefined) updates.headers = body.transport === 'http_streamable' ? normalizeJsonText(body.headersText, 'headersText', 'object') : null;
        if (body.isActive !== undefined) updates.isActive = body.isActive ? 1 : 0;
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = Date.now();
          await input.db.update(mcpServerConfigs).set(updates).where(eq(mcpServerConfigs.id, body.serverId));
          await reloadAgentMcp(input.db, input.loaderConfig, body.agentId ?? '');
        }
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
        const agentMcpRows = await input.db.query.agentMcpConfigs.findMany({
          where: and(eq(agentMcpConfigs.serverId, body.serverId), eq(agentMcpConfigs.agentId, body.agentId)),
        });
        if (agentMcpRows.length > 0) {
          await input.db.delete(agentMcpConfigs).where(eq(agentMcpConfigs.id, agentMcpRows[0].id));
        }
        await input.db.delete(mcpServerConfigs).where(eq(mcpServerConfigs.id, body.serverId));
        await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);
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
        await input.db.insert(agentMcpConfigs).values({
          id: createId(),
          agentId: body.agentId,
          serverId: body.serverId,
          isActive: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);
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
        const agentMcpRows = await input.db.query.agentMcpConfigs.findMany({
          where: and(eq(agentMcpConfigs.serverId, body.serverId), eq(agentMcpConfigs.agentId, body.agentId)),
        });
        if (agentMcpRows.length > 0) {
          await input.db.update(agentMcpConfigs).set({ isActive: body.isActive ? 1 : 0, updatedAt: Date.now() }).where(eq(agentMcpConfigs.id, agentMcpRows[0].id));
        }
        await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);
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
        const agentMcpRows = await input.db.query.agentMcpConfigs.findMany({
          where: and(eq(agentMcpConfigs.serverId, body.serverId), eq(agentMcpConfigs.agentId, body.agentId)),
        });
        if (agentMcpRows.length > 0) {
          await input.db.delete(agentMcpConfigs).where(eq(agentMcpConfigs.id, agentMcpRows[0].id));
        }
        await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);
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