import type { ToolsInput, Tool } from '@forge-runtime/core';

import type { Database } from '../database/index';
import type { AgentLoaderConfig } from './agent-loader-types';
import { createMicroErpTools } from '../micro-erp/tools';
import { createAgentNotificationTools } from '../notifications/tools';
import { createGitHubTools } from '../github/tools';
import { createCoolifyTools } from '../coolify/tools';
import { createAgentScheduleTools } from '../schedules/tools';
import { createCapabilityTools } from '../capabilities/tools';
import { createInternalChatTools } from '../communication/internal-chat-tools';
import { createMiniMaxTools } from '../minimax/tools';
import { getMCPToolsForAgent } from './mcp/client-manager';
import { createAgentSkillTools } from './skills-tools';
import { createInternalAgentTools } from './internal-agent-tools';

export async function loadAgentToolset(input: {
  db: Database;
  loaderConfig: AgentLoaderConfig;
  agentId: string;
  agentName: string;
  allowedToolIds: Set<string>;
}) {
  const microErpTools = createMicroErpTools(input.db, input.allowedToolIds);
  const notificationTools = createAgentNotificationTools(input.db, input.agentId, input.allowedToolIds);
  const githubTools = createGitHubTools(input.agentId, input.loaderConfig.githubApps, input.allowedToolIds);
  const coolifyTools = input.loaderConfig.coolify
    ? createCoolifyTools(input.loaderConfig.coolify, input.allowedToolIds)
    : {};
  const scheduleTools = createAgentScheduleTools(
    input.agentId,
    input.loaderConfig.schedules,
    input.allowedToolIds,
  );
  const capabilityTools = createCapabilityTools(
    input.db,
    input.loaderConfig,
    input.agentId,
    input.allowedToolIds,
  );
  const internalChatTools = createInternalChatTools(
    input.agentId,
    input.agentName,
    input.loaderConfig.internalChat,
    input.allowedToolIds,
  );
  const minimaxTools = input.loaderConfig.minimax
    ? createMiniMaxTools(input.loaderConfig.minimax, input.allowedToolIds)
    : {};
  const skillTools = createAgentSkillTools({
    db: input.db,
    workspaceBasePath: input.loaderConfig.workspaceBasePath,
    agentId: input.agentId,
    allowedToolIds: input.allowedToolIds,
  });
  const internalAgentTools = createInternalAgentTools({
    db: input.db,
    workspaceBasePath: input.loaderConfig.workspaceBasePath,
    githubApps: input.loaderConfig.githubApps,
    emailMailboxes: input.loaderConfig.emailMailboxes,
    coolify: input.loaderConfig.coolify,
    schedules: input.loaderConfig.schedules,
    internalChat: input.loaderConfig.internalChat,
  });
  const mcpTools = await loadMCPToolsForAgent(input.agentId);

  const tools: ToolsInput = {
    ...microErpTools,
    ...notificationTools,
    ...githubTools,
    ...coolifyTools,
    ...scheduleTools,
    ...capabilityTools,
    ...internalChatTools,
    ...minimaxTools,
    ...skillTools,
    ...internalAgentTools,
    ...mcpTools,
  };

  return {
    tools,
    breakdown: {
      microErp: Object.keys(microErpTools).length,
      notifications: Object.keys(notificationTools).length,
      github: Object.keys(githubTools).length,
      coolify: Object.keys(coolifyTools).length,
      schedules: Object.keys(scheduleTools).length,
      capabilities: Object.keys(capabilityTools).length,
      internalChat: Object.keys(internalChatTools).length,
      minimax: Object.keys(minimaxTools).length,
      skills: Object.keys(skillTools).length,
      internalAgents: Object.keys(internalAgentTools).length,
      mcp: Object.keys(mcpTools).length,
      total: Object.keys(tools).length,
    },
  };
}

async function loadMCPToolsForAgent(
  agentId: string,
): Promise<Record<string, Tool<unknown, unknown>>> {
  try {
    const mcpTools = await getMCPToolsForAgent(agentId);

    if (Object.keys(mcpTools).length === 0) {
      return {};
    }

    console.log(`[AgentLoader] Loaded ${Object.keys(mcpTools).length} MCP tool(s) for agent ${agentId}`);
    return mcpTools;
  } catch (error) {
    console.warn(`[AgentLoader] Failed to load MCP tools for agent ${agentId}:`, error);
    return {};
  }
}
