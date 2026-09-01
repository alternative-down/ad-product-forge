import type { Database } from '../database/client';
import type { Agent } from '../database/schema-agents';

/**
 * Look up an agent row by primary key.
 *
 * Replaces the duplicated `db.query.agents.findFirst({ where: eq(fields.id, agentId) })`
 * pattern across the agents/ directory. Returns null when no agent matches;
 * callers should use ensureAgentFound (or equivalent) to throw on missing.
 *
 * Single source of truth: if the lookup ever needs to add a soft-delete
 * filter, add a join, or change the column projection, this is the only
 * site that needs to change.
 */
export async function findAgentById(
  db: Database,
  agentId: string,
): Promise<Agent | null> {
  const agent = await db.query.agents.findFirst({
    where: (fields, operators) => operators.eq(fields.id, agentId),
  });
  return agent ?? null;
}
