
interface HealthcheckEntry {
  agentId: string;
  agentName: string;
  status: string;
  role: string | null;
  lastHeartbeat: number | null;
}

export interface HealthcheckRegistry {
  list(): Iterable<{ id: string }>;
  get(id: string): { meta?: { name?: string }; runtime?: unknown } | undefined;
}

export interface HealthcheckReadModel {
  getAgent(id: string): Promise<{
    id?: string;
    status?: string;
    roleId?: string | null;
    lastHeartbeat?: number | null;
  } | null | undefined>;
}

export async function buildSystemHealthcheck(
  registry: HealthcheckRegistry,
  readModel: HealthcheckReadModel,
): Promise<{
  agents: HealthcheckEntry[];
  timestamp: number;
}> {
  const entries = registry.list();
  const agents: HealthcheckEntry[] = [];

  for (const entry of entries) {
    const agent = await readModel.getAgent(entry.id);
    const runtime = await registry.get(entry.id);

    agents.push({
      agentId: entry.id,
      agentName: runtime?.meta?.name ?? entry.id,
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
