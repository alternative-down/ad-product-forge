import {
  HEARTBEAT_DEAD_THRESHOLD_MS,
  HEARTBEAT_STALE_THRESHOLD_MS,
} from '../../../schedules/lifecycle/cron';

export type AgentHealth = 'healthy' | 'stale' | 'dead' | 'unknown';

interface HealthcheckEntry {
  agentId: string;
  agentName: string;
  status: string;
  role: string | null;
  lastHeartbeat: number | null;
  health: AgentHealth;
  secondsSinceLastHeartbeat: number | null;
}

export interface HealthcheckRegistry {
  list(): Iterable<{ id: string }>;
  get(id: string): { meta?: { name?: string }; runtime?: unknown } | undefined;
}

export interface HealthcheckReadModel {
  getAgent(id: string): Promise<
    | {
        id?: string;
        status?: string;
        roleId?: string | null;
        lastHeartbeat?: number | null;
      }
    | null
    | undefined
  >;
}

/**
 * Categorize an agent's heartbeat freshness relative to now.
 * Returns semantic health label + seconds since last beat.
 *
 * Buckets:
 *  - 'healthy' — last beat within HEARTBEAT_STALE_THRESHOLD_MS
 *  - 'stale'   — last beat within HEARTBEAT_DEAD_THRESHOLD_MS but past stale threshold
 *  - 'dead'    — last beat older than HEARTBEAT_DEAD_THRESHOLD_MS
 *  - 'unknown' — no heartbeat recorded
 */
export function classifyHealth(
  lastHeartbeat: number | null,
  now: number,
): { health: AgentHealth; secondsSinceLastHeartbeat: number | null } {
  if (lastHeartbeat === null || lastHeartbeat === undefined) {
    return { health: 'unknown', secondsSinceLastHeartbeat: null };
  }
  const ageMs = now - lastHeartbeat;
  const secondsSinceLastHeartbeat = Math.floor(ageMs / 1000);
  if (ageMs > HEARTBEAT_DEAD_THRESHOLD_MS) {
    return { health: 'dead', secondsSinceLastHeartbeat };
  }
  if (ageMs > HEARTBEAT_STALE_THRESHOLD_MS) {
    return { health: 'stale', secondsSinceLastHeartbeat };
  }
  return { health: 'healthy', secondsSinceLastHeartbeat };
}

export async function buildSystemHealthcheck(
  registry: HealthcheckRegistry,
  readModel: HealthcheckReadModel,
  now: number = Date.now(),
): Promise<{
  agents: HealthcheckEntry[];
  timestamp: number;
}> {
  const entries = registry.list();
  const agents: HealthcheckEntry[] = [];

  for (const entry of entries) {
    const agent = await readModel.getAgent(entry.id);
    const runtime = await registry.get(entry.id);

    const lastHeartbeat = agent?.lastHeartbeat ?? null;
    const { health, secondsSinceLastHeartbeat } = classifyHealth(lastHeartbeat, now);

    agents.push({
      agentId: entry.id,
      agentName: runtime?.meta?.name ?? entry.id,
      status: agent?.status ?? 'unknown',
      role: agent?.roleId ?? null,
      lastHeartbeat,
      health,
      secondsSinceLastHeartbeat,
    });
  }

  return {
    agents,
    timestamp: now,
  };
}
