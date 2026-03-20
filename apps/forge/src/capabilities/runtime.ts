import type { Database } from '../database/index.js';
import { eq, inArray } from 'drizzle-orm';

import { agents, functionRoles } from '../database/schema.js';
import { loadAgent, type AgentLoaderConfig } from '../agents/agent-loader.js';
import { getInternalAgentRegistry } from '../agents/internal-agent-registry.js';

export async function reloadAgentIfLoaded(db: Database, config: AgentLoaderConfig, agentId: string) {
  const registry = getInternalAgentRegistry();

  if (!registry.get(agentId)) {
    return;
  }

  const runtime = await loadAgent(db, {
    ...config,
    agentId,
  });

  await registry.add(db, runtime);
}

export async function reloadAgentsForFunction(db: Database, config: AgentLoaderConfig, functionId: string) {
  const assignedAgents = await db.query.agents.findMany({
    where: eq(agents.functionId, functionId),
    columns: {
      id: true,
    },
  });

  for (const agent of assignedAgents) {
    await reloadAgentIfLoaded(db, config, agent.id);
  }
}

export async function reloadAgentsForRole(db: Database, config: AgentLoaderConfig, roleId: string) {
  const linkedFunctions = await db.query.functionRoles.findMany({
    where: eq(functionRoles.roleId, roleId),
    columns: {
      functionId: true,
    },
  });

  if (linkedFunctions.length === 0) {
    return;
  }

  const functionIds = linkedFunctions.map((link) => link.functionId);
  const assignedAgents = await db.query.agents.findMany({
    where: inArray(agents.functionId, functionIds),
    columns: {
      id: true,
    },
  });

  for (const agent of assignedAgents) {
    await reloadAgentIfLoaded(db, config, agent.id);
  }
}
