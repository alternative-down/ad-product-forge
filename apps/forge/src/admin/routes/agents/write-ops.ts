/**
 * Agent Admin Write Operations - Phase 2 of #689
 * POST routes for agent operations extracted from routes.ts
 */

import { z } from 'zod';
import type { ForgeHttpServerAdapter, HttpHandler } from '../../../http/server';
import { registerLifecycleOps } from './split/lifecycle-ops';
import { registerContractOps } from './split/contract-ops';
import { registerRoleOps } from './split/role-ops';
import { registerLifecycleDelegateOps } from './split/lifecycle-delegate-ops';
import { registerMcpOps } from './split/mcp-ops';
import { registerSkillOps } from './split/skill-ops';
import { registerProviderOps } from './split/provider-ops';
import { registerConfigOps } from './split/config-ops';


import type {Database} from '../../../../src/database/schema';
import type { AgentLoaderConfig } from '../../../agents/agent-loader';
import type { GitHubAppManager } from '../../../github/manager';
import type { AgentEmailManager } from '../../../email/migadu-manager';
import type { CoolifyManager } from '../../../coolify/manager';
import type { createAgentScheduleManager } from '../../../schedules/manager';








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
  // Lifecycle ops — extracted to split/lifecycle-ops.ts
  registerLifecycleOps(httpServer, input, ops);
  // Contract ops — extracted to split/contract-ops.ts
  // Lifecycle delegate ops — extracted to split/lifecycle-delegate-ops.ts
  registerLifecycleDelegateOps(httpServer, input, ops);
  // MCP ops — extracted to split/mcp-ops.ts
  registerMcpOps(httpServer, input.db, input.loaderConfig);

  // Skill ops — extracted to split/skill-ops.ts
  registerSkillOps(httpServer, input.db, input);


  // Role ops — extracted to split/role-ops.ts
  registerRoleOps(httpServer, input.db);
}