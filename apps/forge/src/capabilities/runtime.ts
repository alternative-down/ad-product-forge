import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';

import type { Database } from '../database/client';
import { findOrThrow } from '../database/find-or-throw';
import { and, eq } from 'drizzle-orm';

import { agents, agentProviders, agentRoles } from '../database/schema';
import { loadAgent, type AgentLoaderConfig } from '../agents/agent-loader';
import { getInternalAgentRegistry } from '../agents/internal-agent-registry';
import { createAgentNotificationStore } from '../notifications/store';
import { decryptSecret, encryptSecret } from '../encryption/crypto';

export async function reloadAgentIfLoaded(
  db: Database,
  config: AgentLoaderConfig,
  agentId: string,
) {
  const registry = getInternalAgentRegistry();

  if (!registry.get(agentId)) {
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'debug',
      message: 'Agent not in registry, skipping reload',
      context: { agentId },
    });
    return;
  }

  const runtime = await loadAgent(db, {
    ...config,
    agentId,
  });

  await registry.add(db, runtime);
  forgeDebug({
    scope: 'capabilities-runtime',
    level: 'info',
    message: 'Agent reloaded',
    context: { agentId },
  });
}

export async function reloadAgentsForRole(db: Database, config: AgentLoaderConfig, roleId: string) {
  const assignedAgents = await db.query.agents.findMany({
    where: eq(agents.roleId, roleId),
    columns: {
      id: true,
    },
  });

  forgeDebug({
    scope: 'capabilities-runtime',
    level: 'info',
    message: 'Reloading agents for role',
    context: { roleId, agentCount: assignedAgents.length },
  });

  await Promise.all(assignedAgents.map((agent) => reloadAgentIfLoaded(db, config, agent.id)));
}

// L#NN-32 v13 type-guard for stored credentials
interface StoredCredentials {
  agentId: string;
  displayName?: string;
  description?: string;
}

function isStoredCredentials(value: unknown): value is StoredCredentials {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.agentId === 'string';
}

/**
 * Updates the internal-chat provider's encrypted credentials to reflect the
 * agent's current displayName and description.
 *
 * Behavior change (closes #5974): decrypt/parse errors and DB update errors
 * now THROW (was: silent return). Missing provider is still a legitimate
 * no-op (returns {updated: false, reason: 'no-provider'}).
 */
export async function updateInternalChatProviderProfile(
  db: Database,
  input: { agentId: string; displayName: string; description: string },
): Promise<{ updated: true } | { updated: false; reason: 'no-provider' }> {
  const provider = await db.query.agentProviders.findFirst({
    where: and(
      eq(agentProviders.agentId, input.agentId),
      eq(agentProviders.providerType, 'internal-chat'),
    ),
  });

  if (provider === undefined) {
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'debug',
      message: 'No internal-chat provider found for agent',
      context: { agentId: input.agentId },
    });
    return { updated: false, reason: 'no-provider' };
  }

  let credentials: StoredCredentials;
  try {
    const decrypted = decryptSecret(provider.encryptedCredentials);
    const parsed: unknown = JSON.parse(decrypted);
    if (!isStoredCredentials(parsed)) {
      throw new Error('Parsed credentials do not match StoredCredentials shape');
    }
    credentials = parsed;
  } catch (err) {
    throw new Error(
      `updateInternalChatProviderProfile: failed to decrypt/parse credentials for agent ${input.agentId}: ${errorMsg(err)}`,
    );
  }

  const nextCredentials = {
    ...credentials,
    agentId: input.agentId,
    displayName: input.displayName,
    description: input.description,
  };

  try {
    await db
      .update(agentProviders)
      .set({
        encryptedCredentials: encryptSecret(JSON.stringify(nextCredentials)),
      })
      .where(eq(agentProviders.id, provider.id));
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'info',
      message: 'Internal chat provider profile updated',
      context: { agentId: input.agentId },
    });
  } catch (err) {
    throw new Error(
      `updateInternalChatProviderProfile: failed to update provider for agent ${input.agentId}: ${errorMsg(err)}`,
    );
  }

  return { updated: true };
}

// Shared helper for changeAgentRole + changeAgentRoleFromAdmin (closes #5971 DRY)

interface ChangeAgentRoleInternalInput {
  db: Database;
  loaderConfig: AgentLoaderConfig;
  targetAgentId: string;
  roleId: string;
  changedBy: string;
  changedByAgentId?: string;
  source: 'capabilities' | 'admin-console';
}

interface ChangeAgentRoleInternalResult {
  changedByAgentId?: string;
  agentId: string;
  roleId: string;
  roleName: string;
  changedBy: 'capabilities' | 'admin-console';
}

/**
 * Shared internal flow for role changes (closes #5971 DRY + #5973 TOCTOU).
 *
 * Reads + write are wrapped in db.transaction so concurrent delete or
 * role change cannot interleave. Side effects run AFTER the transaction
 * commits (they are not transactional).
 */
async function _changeAgentRoleInternal(input: ChangeAgentRoleInternalInput): Promise<ChangeAgentRoleInternalResult> {
  const { targetAgent, agentRole } = await input.db.transaction(async (tx) => {
    const targetAgent = await findOrThrow(
      tx.query.agents,
      {
        scope: 'capabilities-runtime',
        entity: 'Target agent',
        op: 'changeAgentRole',
        idValue: input.targetAgentId,
        idField: 'targetAgentId',
      },
      { where: eq(agents.id, input.targetAgentId) },
    );
    const agentRole = await findOrThrow(
      tx.query.agentRoles,
      {
        scope: 'capabilities-runtime',
        entity: 'Agent role',
        op: 'changeAgentRole',
        idValue: input.roleId,
        idField: 'roleId',
      },
      { where: eq(agentRoles.id, input.roleId) },
    );

    await tx
      .update(agents)
      .set({
        roleId: input.roleId,
        updatedAt: Date.now(),
      })
      .where(eq(agents.id, input.targetAgentId));

    return { targetAgent, agentRole };
  });

  forgeDebug({
    scope: 'capabilities-runtime',
    level: 'info',
    message: `Changing agent role (${input.source})`,
    context: {
      targetAgentId: input.targetAgentId,
      roleId: input.roleId,
    },
  });

  // Side effects OUTSIDE transaction.
  // Provider profile update (closes #5974): catches and logs partial failures.
  try {
    const result = await updateInternalChatProviderProfile(input.db, {
      agentId: input.targetAgentId,
      displayName: targetAgent.name,
      description: agentRole.description ?? agentRole.name,
    });
    if (!result.updated) {
      forgeDebug({
        scope: 'capabilities-runtime',
        level: 'info',
        message: 'No internal-chat provider to update; role change committed',
        context: { targetAgentId: input.targetAgentId },
      });
    }
  } catch (err) {
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'error',
      message: 'Provider profile update failed; role change still committed',
      context: { targetAgentId: input.targetAgentId, error: errorMsg(err) },
    });
  }

  const notifications = createAgentNotificationStore(input.db);
  const changeTimestamp = Date.now();
  const eventContent = createRoleChangeContent({
    targetAgentId: input.targetAgentId,
    roleId: agentRole.id,
    roleName: agentRole.name,
    changedBy: input.changedBy,
    changedByAgentId: input.changedByAgentId,
    timestamp: changeTimestamp,
  });

  await notifications.createNotification({
    agentId: input.targetAgentId,
    content: eventContent,
  });

  await reloadAgentIfLoaded(input.db, input.loaderConfig, input.targetAgentId);

  const targetEntry = getInternalAgentRegistry().get(input.targetAgentId);
  targetEntry?.runner?.notifyExternalEvent({
    type: 'role-change',
    groupKey: `role-change:${input.targetAgentId}`,
    groupMetadata: {
      source: input.source,
      targetAgentId: input.targetAgentId,
    },
    idempotencyKey: `role-change:${input.targetAgentId}:${changeTimestamp}`,
    text: eventContent,
    timestamp: changeTimestamp,
  });

  forgeDebug({
    scope: 'capabilities-runtime',
    level: 'info',
    message: 'Agent role changed',
    context: { targetAgentId: input.targetAgentId, roleId: agentRole.id, roleName: agentRole.name, source: input.source },
  });

  return {
    agentId: input.targetAgentId,
    roleId: agentRole.id,
    roleName: agentRole.name,
    changedBy: input.source,
    changedByAgentId: input.changedByAgentId,
  };
}

export async function changeAgentRole(input: {
  db: Database;
  loaderConfig: AgentLoaderConfig;
  actorAgentId: string;
  targetAgentId: string;
  roleId: string;
}) {
  const actorAgent = await findOrThrow(
    input.db.query.agents,
    {
      scope: 'capabilities-runtime',
      entity: 'Actor agent',
      op: 'changeAgentRole',
      idValue: input.actorAgentId,
      idField: 'actorAgentId',
    },
    { where: eq(agents.id, input.actorAgentId) },
  );

  const actorIsSelf = input.actorAgentId === input.targetAgentId;
  const actorIsAdmin = actorAgent.roleId === 'admin';
  if (!actorIsSelf && !actorIsAdmin) {
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'warn',
      message: 'changeAgentRole: actor lacks permission',
      context: {
        actorAgentId: input.actorAgentId,
        actorRoleId: actorAgent.roleId,
        targetAgentId: input.targetAgentId,
      },
    });
    throw new Error(
      `Agent ${input.actorAgentId} cannot change role for ${input.targetAgentId}`,
    );
  }

  const actorLabel = actorIsSelf ? `${actorAgent.name} (self)` : actorAgent.name;

  return await _changeAgentRoleInternal({
    db: input.db,
    loaderConfig: input.loaderConfig,
    targetAgentId: input.targetAgentId,
    roleId: input.roleId,
    changedBy: actorLabel,
    changedByAgentId: input.actorAgentId,
    source: 'capabilities',
  });
}

export async function changeAgentRoleFromAdmin(input: {
  db: Database;
  loaderConfig: AgentLoaderConfig;
  targetAgentId: string;
  roleId: string;
}) {
  return await _changeAgentRoleInternal({
    db: input.db,
    loaderConfig: input.loaderConfig,
    targetAgentId: input.targetAgentId,
    roleId: input.roleId,
    changedBy: 'admin console',
    source: 'admin-console',
  });
}

function createRoleChangeContent(input: {
  targetAgentId: string;
  roleId: string;
  roleName: string;
  changedBy: string;
  changedByAgentId?: string;
  timestamp: number;
}) {
  const lines = [
    'Agent role assignment changed.',
    `Target agent id: ${input.targetAgentId}`,
    `Role id: ${input.roleId}`,
    `Role name: ${input.roleName}`,
    `Changed by: ${input.changedBy}`,
    `Timestamp: ${new Date(input.timestamp).toISOString()}`,
  ];

  if (input.changedByAgentId != null) {
    lines.push(`Changed by agent id: ${input.changedByAgentId}`);
  }

  return lines.join('\n');
}
