import type { CoolifyManager } from '../coolify/manager';
import type { InternalChatService } from '../communication/internal-chat-service';
import type { Database } from '../database/index';
import type { GitHubAppManager } from '../github/manager';
import type { MiniMaxManager } from '../minimax/manager';
import type { createAgentScheduleManager } from '../schedules/manager';

export interface AgentLoaderConfig {
  workspaceBasePath: string;
  workflows?: import('./agent-runtime-types').CreateAgentConfig['workflows'];
  githubApps: GitHubAppManager;
  coolify: CoolifyManager | null;
  minimax?: MiniMaxManager;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  internalChat: InternalChatService;
}

export interface SingleAgentLoaderConfig extends AgentLoaderConfig {
  agentId: string;
}

export type AgentLoaderInput = {
  db: Database;
  config: AgentLoaderConfig;
};
