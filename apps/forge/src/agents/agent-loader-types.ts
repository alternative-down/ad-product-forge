import type { CoolifyManager } from '../coolify/manager';
import type { InternalChatService } from '../communication/internal-chat-service';

import type { Database } from '../database/client';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { GitHubAppManager } from '../github/manager';
import type { MiniMaxManager } from '../minimax/manager';
import type { AgentScheduleManager } from '../schedules/manager/index';

export interface AgentLoaderConfig {
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  minimax?: MiniMaxManager;
  schedules: AgentScheduleManager;
  internalChat: InternalChatService;
}

export interface SingleAgentLoaderConfig extends AgentLoaderConfig {
  agentId: string;
}

export type AgentLoaderInput = {
  db: Database;
  config: AgentLoaderConfig;
};
