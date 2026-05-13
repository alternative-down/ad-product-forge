/**
 * Agent Admin Write Operations - Phase 2 of #689
 * POST routes for agent operations extracted from routes.ts
 */

import { z } from 'zod';
import type { HttpHandler } from '../../../http/server';
import { forgeDebug } from '../debug';
import { createId } from '../../../utils/id';
import { eq } from 'drizzle-orm';
import { agents, agentRoles } from '../../../../src/database/schema';
import { changeAgentRoleFromAdmin, updateInternalChatProviderProfile, reloadAgentIfLoaded } from '../../../capabilities/runtime';
import { roleToolPermissions, roleWorkflowPermissions } from '../../../../src/database/schema';
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
import { registerRoleOps } from './_split/role-ops';
import { registerSkillOps } from './_split/skill-ops';
import { registerProviderOps } from './_split/provider-ops';


import type {Database} from '../../../../src/database/schema';
import type { AgentLoaderConfig } from '../../../agents/agent-loader';
import type { GitHubAppManager } from '../../../github/manager';
import type { AgentEmailManager } from '../../../email/migadu-manager';
import type { CoolifyManager } from '../../../coolify/manager';
import type { createAgentScheduleManager } from '../../../schedules/manager';


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
  // Lifecycle ops — extracted to _split/lifecycle-ops.ts
  registerLifecycleOps(httpServer, input, ops);
  // Contract ops — extracted to _split/contract-ops.ts
  registerContractOps({ httpServer, db: input.db, ops });
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
  // Provider ops — extracted to _split/provider-ops.ts
  registerProviderOps(httpServer);


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


  // Skill ops — extracted to _split/skill-ops.ts
  registerSkillOps(httpServer, input.db, input);


  // Role ops — extracted to _split/role-ops.ts
  registerRoleOps(httpServer, input.db);
}