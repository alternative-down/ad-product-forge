import { oauthStore } from '@forge-runtime/core';
import { registerSystemReadRoutes } from './read.js';
import { registerSystemWriteRoutes } from './write.js';

export { registerSystemReadRoutes, registerSystemWriteRoutes };

/**
 * Build the system healthcheck payload by iterating all registered agents.
 * @param {any} registry - Internal agent registry
 * @param {any} readModel - Admin read model
 */
export async function buildSystemHealthcheck(registry, readModel) {
  const agents = registry.list();
  const items = [];

  for (const entry of agents) {
    const [runtimeMemory, recentConversations, executionSteps] = await Promise.all([
      readModel.getAgentRuntimeMemory(entry.runtime.id),
      readModel.listAgentRecentConversations({ agentId: entry.runtime.id, limit: 1 }),
      readModel.listAgentExecutionSteps({ agentId: entry.runtime.id, limit: 1 }),
    ]);

    items.push({
      type: entry.constructor.name,
      runtime: entry.runtime,
      runtimeMemory,
      recentConversations,
      executionSteps,
    });
  }

  return { agents: items };
}

/**
 * Read the current OAuth state for supported providers.
 */
export async function readOauthState() {
  const defaultPath = oauthStore.getDefaultPath();
  const stored = await oauthStore.read(defaultPath);

  return {
    anthropic: { exists: !!stored?.anthropic },
    openaiCodex: { exists: !!stored?.['openai-codex'] },
  };
}