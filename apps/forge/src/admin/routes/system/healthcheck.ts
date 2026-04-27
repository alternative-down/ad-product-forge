import type { InternalAgentRegistry } from '../../agents/internal-agent-registry.js';
import type { AdminReadModel } from '../read-model.js';

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
}
