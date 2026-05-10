import type { InternalAgentRegistry } from '../../agents/internal-agent-registry';
import type { AdminReadModel } from '../read-model';
import { forgeDebug } from '../debug';

interface HealthcheckEntry {
  agentId: string;
  agentName: string;
  status: string;
  role: string | null;
  lastHeartbeat: number | null;
}

export async function buildSystemHealthcheck(
  registry: InternalAgentRegistry,
  readModel: AdminReadModel,
): Promise<{
  agents: HealthcheckEntry[];
  timestamp: number;
}> {
  try {
    const entries = registry.list();
    const agents: HealthcheckEntry[] = [];

    for (const entry of entries) {
      const agent = await readModel.getAgent(entry.runtime.id);
      const runtime = await registry.get(entry.runtime.id);

      agents.push({
        agentId: entry.runtime.id,
        agentName: runtime?.meta.name ?? entry.runtime.id,
        status: agent?.status ?? 'unknown',
        role: agent?.roleId ?? null,
        lastHeartbeat: agent?.lastHeartbeat ?? null,
      });
    }

    return {
      agents,
      timestamp: Date.now(),
    };
  } catch (err) {
    forgeDebug({
      scope: 'system-healthcheck',
      level: 'error',
      message: '[system-healthcheck] buildSystemHealthcheck failed',
      context: {
        agentCount: registry.list().length,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
