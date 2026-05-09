import { eq } from 'drizzle-orm';
import type { Database } from '../../database/index';
import type { AgentLoaderConfig } from '../../agents/agent-loader';
import { reloadAgentIfLoaded } from '../../capabilities/runtime';
import { agentMcpConfigs } from '../../database/schema';
import { forgeDebug } from '../debug';

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
  try {
    const linkedConfigs = await db.query.agentMcpConfigs.findMany({
      where: eq(agentMcpConfigs.serverId, serverId),
      columns: { agentId: true },
    });

    for (const linkedConfig of linkedConfigs) {
      await reloadAgentMcp(db, loaderConfig, linkedConfig.agentId);
    }
  } catch (err) {
    forgeDebug({ scope: 'mcp-helpers', level: 'error', message: '[mcp-helpers] reloadLinkedAgentsForMcpServer failed', context: { error: err instanceof Error ? err.message : String(err) }});
    throw err;
  }
}
