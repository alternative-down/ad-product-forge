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
import { registerLifecycleDelegateOps } from './_split/lifecycle-delegate-ops';
import { registerSkillOps } from './_split/skill-ops';
import { registerProviderOps } from './_split/provider-ops';
import { registerConfigOps } from './_split/config-ops';


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
  // Lifecycle delegate ops — extracted to _split/lifecycle-delegate-ops.ts
  registerLifecycleDelegateOps(httpServer, input, ops);

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