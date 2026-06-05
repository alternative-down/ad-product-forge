import { eq, and } from 'drizzle-orm';
import { createId } from '../../../utils/id';
import type { Database } from '../../../database/client';
import { agentMcpConfigs } from '../../../database/schema';

export interface AssignAgentMcpServerResult {
  configId: string;
  isNew: boolean;
}

export async function assignAgentMcpServer(
  db: Database,
  agentId: string,
  serverId: string,
  isActive: boolean = true,
): Promise<AssignAgentMcpServerResult> {
  const configId = createId();
  const now = Date.now();
  await db
    .insert(agentMcpConfigs)
    .values({
      id: configId,
      agentId,
      serverId,
      isActive: isActive ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [agentMcpConfigs.agentId, agentMcpConfigs.serverId],
      set: {
        isActive: isActive ? 1 : 0,
        updatedAt: now,
      },
    });

  return { configId, isNew: true };
}

export async function setMcpServerActive(
  db: Database,
  configId: string,
  agentId: string,
  isActive: boolean,
) {
  await db
    .update(agentMcpConfigs)
    .set({
      isActive: isActive ? 1 : 0,
      updatedAt: Date.now(),
    })
    .where(and(eq(agentMcpConfigs.id, configId), eq(agentMcpConfigs.agentId, agentId)));
}

export async function detachMcpServer(
  db: Database,
  configId: string,
  agentId: string,
): Promise<boolean> {
  const config = await db.query.agentMcpConfigs.findFirst({
    where: and(eq(agentMcpConfigs.id, configId), eq(agentMcpConfigs.agentId, agentId)),
  });

  if (!config) {
    return false;
  }

  await db.delete(agentMcpConfigs).where(eq(agentMcpConfigs.id, configId));
  return true;
}
