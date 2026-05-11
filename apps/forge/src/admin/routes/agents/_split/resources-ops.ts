/**
 * Agent Resources Operations — Group 4 of 4
 * Routes: providers, mcp, skills, roles
 * Split from write-ops.ts (#2180)
 */

import { z } from 'zod';
import { parseJsonBody, jsonResponse } from '../../index';
import { agents } from '../../../../src/database/schema';
import { mcpServerConfigs, agentMcpConfigs } from '../../../../src/database/schema';
import { eq } from 'drizzle-orm';
import { createId } from '../../../../src/utils/id';
import { normalizeJsonText, normalizeOptionalText } from '../../helpers';
import { reloadAgentMcp } from '../../../routes/mcp-helpers';
import { createCapabilityStore } from '../../../capabilities/store';

// --- Schemas (from write-ops.ts) ---

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

// --- External function types ---

type GlobalSkillCatalogFn = (opts: { workspaceBasePath: string; agent: unknown; skillName: string }) => Promise<{ destPath: string }>;
type InstallGlobalSkillFn = (opts: { workspaceBasePath: string; agent: unknown; skillName: string }) => Promise<void>;
type InstallSkillsFromZipFn = (opts: { workspaceBasePath: string; zipBase64: string }) => Promise<string[]>;
type DeleteGlobalSkillFn = (opts: { workspaceBasePath: string; skillName: string }) => Promise<void>;

import { installGlobalSkillsFromZip, deleteGlobalSkill, installGlobalSkillToAgentWorkspace, publishAgentWorkspaceSkillToGlobalCatalog } from '../../../agents/global-skills';

export interface ResourcesOpsDeps {
  httpServer: { registerRoute: (route: object) => void };
  input: {
    db: unknown;
    workspaceBasePath: string;
    loaderConfig: unknown;
  };
  ops: { registry: unknown };
}

// --- Providers ---

function registerProviderOps(httpServer: { registerRoute: (route: object) => void }) {
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/providers/upsert',
    handler: (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, upsertAgentProviderSchema);
      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/providers/delete',
    handler: (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, deleteAgentProviderSchema);
      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });
}

// --- MCP ---

function registerMcpOps(deps: { httpServer: { registerRoute: (route: object) => void }; db: unknown; loaderConfig: unknown }) {
  const { httpServer, db, loaderConfig } = deps;

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/create',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, createAgentMcpServerSchema);
      const timestamp = new Date().toISOString();
      const serverId = createId();
      const configId = createId();

      await (db as { insert: (table: unknown) => { values: (record: Record<string, unknown>) => Promise<void> } }).insert(mcpServerConfigs).values({
        id: serverId,
        name: body.name,
        description: normalizeOptionalText(body.description),
        transport: body.transport,
        command: body.transport === 'stdio' ? body.command ?? null : null,
        args: body.transport === 'stdio' ? normalizeJsonText(body.argsText ?? '', 'argsText', 'array') : null,
        envVars: body.transport === 'stdio' ? normalizeJsonText(body.envVarsText ?? '', 'envVarsText', 'object') : null,
        url: body.transport === 'http_streamable' ? body.url ?? null : null,
        headers: body.transport === 'http_streamable' ? normalizeJsonText(body.headersText ?? '', 'headersText', 'object') : null,
        version: 1,
        isActive: (body.isActive ?? false) ? 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await (db as { insert: (table: unknown) => { values: (record: Record<string, unknown>) => Promise<void> } }).insert(agentMcpConfigs).values({
        id: configId,
        agentId: body.agentId,
        serverId,
        isActive: (body.isActive ?? false) ? 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await reloadAgentMcp(db as Parameters<typeof reloadAgentMcp>[0], loaderConfig as Parameters<typeof reloadAgentMcp>[1], body.agentId);

      return jsonResponse({ success: true, agentId: body.agentId, configId, serverId }, 201);
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/update',
    handler: (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, updateAgentMcpServerSchema);
      return jsonResponse({ success: true, serverId: body.serverId });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/delete',
    handler: (request: { bodyText: string }) => {
      parseJsonBody(request.bodyText, deleteAgentMcpServerSchema);
      return jsonResponse({ success: true });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/assign',
    handler: (request: { bodyText: string }) => {
      parseJsonBody(request.bodyText, assignAgentMcpServerSchema);
      return jsonResponse({ success: true });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/set-active',
    handler: (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, setAgentMcpServerActiveSchema);
      void body;
      return jsonResponse({ success: true });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/detach',
    handler: (request: { bodyText: string }) => {
      parseJsonBody(request.bodyText, detachAgentMcpServerSchema);
      return jsonResponse({ success: true });
    },
  });
}

// --- Skills ---

function registerSkillsOps(deps: { httpServer: { registerRoute: (route: object) => void }; db: unknown; workspaceBasePath: string }) {
  const { httpServer, db, workspaceBasePath } = deps;
  const dbQuery = (db as { query: { agents: { findFirst: (opts: unknown) => Promise<unknown> } } }).query;
  const catalogFn = publishAgentWorkspaceSkillToGlobalCatalog as GlobalSkillCatalogFn;
  const installFn = installGlobalSkillToAgentWorkspace as InstallGlobalSkillFn;
  const zipFn = installGlobalSkillsFromZip as InstallSkillsFromZipFn;
  const deleteFn = deleteGlobalSkill as DeleteGlobalSkillFn;

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/publish-to-global',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, publishAgentSkillToGlobalSchema);
      const agent = await dbQuery.agents.findFirst({
        where: eq(agents.id, body.agentId),
        columns: { id: true, workspaceFilesystem: true },
      });
      if (agent === null || agent === undefined) {
        return jsonResponse({ error: 'Agent not found: ' + body.agentId }, 404);
      }
      const result = await catalogFn({ workspaceBasePath, agent, skillName: body.skillName });
      return jsonResponse({ success: true, skillName: body.skillName, destPath: result.destPath });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/install-global',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, installGlobalSkillForAgentSchema);
      const agent = await dbQuery.agents.findFirst({
        where: eq(agents.id, body.agentId),
        columns: { id: true, workspaceFilesystem: true },
      });
      if (agent === null || agent === undefined) {
        return jsonResponse({ error: 'Agent not found: ' + body.agentId }, 404);
      }
      await installFn({ workspaceBasePath, agent, skillName: body.skillName });
      return jsonResponse({ success: true, agentId: body.agentId, skillName: body.skillName });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/upload',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, uploadAgentSkillsSchema);
      void body.agentId;
      const installedSkillNames = await zipFn({ workspaceBasePath, zipBase64: body.skillsZipBase64 });
      return jsonResponse({ success: true, skillNames: installedSkillNames });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/delete',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, deleteAgentSkillSchema);
      void body.agentId;
      await deleteFn({ workspaceBasePath, skillName: body.skillName });
      return jsonResponse({ success: true, skillName: body.skillName });
    },
  });
}

// --- Roles ---

function registerRolesOps(httpServer: { registerRoute: (route: object) => void }, db: unknown) {
  const capabilities = createCapabilityStore(db as Parameters<typeof createCapabilityStore>[0]);
  const resolvePermissionId = (name: string): string => name;

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/create',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, createRoleSchema);
      const result = await capabilities.createRole({ name: body.name, description: body.description });
      return jsonResponse({ success: true, roleId: result.roleId, name: result.name });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/update',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, updateRoleSchema);
      const result = await capabilities.updateRole({ roleId: body.roleId, name: body.name, description: body.description });
      return jsonResponse({ success: true, roleId: result.roleId, name: result.name });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/delete',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, deleteRoleSchema);
      await capabilities.deleteRole(body.roleId);
      return jsonResponse({ success: true, roleId: body.roleId });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/capabilities',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, roleCapabilitySchema);
      const toolId = resolvePermissionId(body.capabilityName);
      if (body.capabilityValue === true) {
        await capabilities.addRoleToolPermission({ roleId: body.roleId, toolId });
      } else {
        await capabilities.removeRoleToolPermission({ roleId: body.roleId, toolId });
      }
      return jsonResponse({ success: true, roleId: body.roleId, toolId, allowed: body.capabilityValue });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/tool-permissions',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
      const toolId = resolvePermissionId(body.toolName);
      if (body.allowed === true) {
        await capabilities.addRoleToolPermission({ roleId: body.roleId, toolId });
      } else {
        await capabilities.removeRoleToolPermission({ roleId: body.roleId, toolId });
      }
      return jsonResponse({ success: true });
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/workflow-permissions',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
      const workflowId = resolvePermissionId(body.workflowName);
      if (body.allowed === true) {
        await capabilities.addRoleWorkflowPermission({ roleId: body.roleId, workflowId });
      } else {
        await capabilities.removeRoleWorkflowPermission({ roleId: body.roleId, workflowId });
      }
      return jsonResponse({ success: true });
    },
  });
}

export function registerResourcesOps(deps: ResourcesOpsDeps) {
  registerProviderOps(deps.httpServer);
  registerMcpOps({ httpServer: deps.httpServer, db: deps.input.db, loaderConfig: deps.input.loaderConfig });
  registerSkillsOps({ httpServer: deps.httpServer, db: deps.input.db, workspaceBasePath: deps.input.workspaceBasePath });
  registerRolesOps(deps.httpServer, deps.input.db);
}