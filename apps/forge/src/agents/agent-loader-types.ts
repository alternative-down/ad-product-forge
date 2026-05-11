import type { CoolifyManager } from '../coolify/manager';
import type { InternalChatService } from '../communication/internal-chat-service';

import type {Database} from '../database/schema';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { GitHubAppManager } from '../github/manager';
import type { MiniMaxManager } from '../minimax/manager';
import type { createAgentScheduleManager } from '../schedules/manager';

export interface AgentLoaderConfig {
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  minimax?: MiniMaxManager;
  /**
   * Global scheduler for admin routes only.
   * Per-agent schedulers are created inside internal-agent-registry.
   * Set to null if not needed (e.g., during agent load).
   */
  /**
   * Scheduler for admin operations. Per-agent schedulers are created
   * inside internal-agent-registry via createPerAgentScheduleManager().
   * May be null during agent loading (cleanConfig path).
   */
  schedules: ReturnType<typeof createAgentScheduleManager> | null;
  internalChat: InternalChatService;
}

export interface SingleAgentLoaderConfig extends AgentLoaderConfig {
  agentId: string;
}

export type AgentLoaderInput = {
  db: Database;
  config: AgentLoaderConfig;
};
