import { eq } from 'drizzle-orm';
import type { Database } from '../../database/index.js';
import type { AgentLoaderConfig } from '../../agents/agent-loader.js';
import { reloadAgentIfLoaded } from '../../capabilities/runtime.js';
import { agentMcpConfigs } from '../../database/schema.js';

export async function reloadAgentMcp(
  db: Database,
  loaderConfig: AgentLoaderConfig,
  agentId: string,
): Promise<void> {
  await reloadAgentIfLoaded(db, loaderConfig, agentId);
}

export async function reloadLinkedAgentsForMcpServer(
  db: Database,
  loaderConfig: AgentLoaderConfig,
  serverId: string,
): Promise<void> {
  const linkedConfigs = await db.query.agentMcpConfigs.findMany({
    where: eq(agentMcpConfigs.serverId, serverId),
    columns: { agentId: true },
  });

  for (const linkedConfig of linkedConfigs) {
    await reloadAgentMcp(db, loaderConfig, linkedConfig.agentId);
  }
}
