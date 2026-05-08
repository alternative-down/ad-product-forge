import { forgeDebug } from '@forge-runtime/core';

import type {Database} from '../database/schema';
import { and, eq } from 'drizzle-orm';

import { agents, agentProviders, agentRoles } from '../database/schema';
import { loadAgent, type AgentLoaderConfig } from '../agents/agent-loader';
import { getInternalAgentRegistry } from '../agents/internal-agent-registry';
import { createAgentNotificationStore } from '../notifications/store';
import { decryptSecret, encryptSecret } from '../encryption/crypto';

export async function reloadAgentIfLoaded(db: Database, config: AgentLoaderConfig, agentId: string) {
  const registry = getInternalAgentRegistry();

  if (!registry.get(agentId)) {
    forgeDebug({ scope: 'capabilities-runtime', level: 'debug', message: 'Agent not in registry, skipping reload', context: { agentId } });
    return;
  }

  try {
    const runtime = await loadAgent(db, {
      ...config,
      agentId,
    });

    await registry.add(db, runtime);
    forgeDebug({ scope: 'capabilities-runtime', level: 'info', message: 'Agent reloaded', context: { agentId } });
  } catch (error) {
    forgeDebug({ scope: 'capabilities-runtime', level: 'error', message: 'Failed to reload agent', context: { agentId, error } });
    throw error;
  }
}

export async function reloadAgentsForRole(db: Database, config: AgentLoaderConfig, roleId: string) {
  try {
    const assignedAgents = await db.query.agents.findMany({
      where: eq(agents.roleId, roleId),
      columns: {
        id: true,
      },
    });

    forgeDebug({ scope: 'capabilities-runtime', level: 'info', message: 'Reloading agents for role', context: { roleId, agentCount: assignedAgents.length } });

    for (const agent of assignedAgents) {
      await reloadAgentIfLoaded(db, config, agent.id);
    }
  } catch (error) {
    forgeDebug({ scope: 'capabilities-runtime', level: 'error', message: 'Failed to reload agents for role', context: { roleId, error } });
    throw error;
  }
}

export async function changeAgentRole(input: {
  db: Database;
  loaderConfig: AgentLoaderConfig;
  actorAgentId: string;
  targetAgentId: string;
  roleId: string;
}) {
  let actorAgent;
  try {
    actorAgent = await input.db.query.agents.findFirst({
      where: eq(agents.id, input.actorAgentId),
    });
  } catch (err) {
    forgeDebug({ scope: 'capabilities-runtime', level: 'error', message: 'changeAgentRole read actor failed', context: { actorAgentId: input.actorAgentId, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }

  if (!actorAgent) {
    forgeDebug({ scope: "capabilities-runtime", level: "warn", runtimeId: input.actorAgentId, message: "changeAgentRole: actor agent not found" });
    throw new Error(`Actor agent not found: ${input.actorAgentId}`);
  }

  let targetAgent;
  try {
    targetAgent = await input.db.query.agents.findFirst({
      where: eq(agents.id, input.targetAgentId),
    });
  } catch (err) {
    forgeDebug({ scope: 'capabilities-runtime', level: 'error', message: 'changeAgentRole read target failed', context: { targetAgentId: input.targetAgentId, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }

  if (!targetAgent) {
    forgeDebug({ scope: "capabilities-runtime", level: "warn", runtimeId: input.targetAgentId, message: "changeAgentRole: target agent not found" });
    throw new Error(`Target agent not found: ${input.targetAgentId}`);
  }

  let agentRole;
  try {
    agentRole = await input.db.query.agentRoles.findFirst({
      where: eq(agentRoles.id, input.roleId),
    });
  } catch (err) {
    forgeDebug({ scope: 'capabilities-runtime', level: 'error', message: 'changeAgentRole read role failed', context: { roleId: input.roleId, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }

  if (!agentRole) {
    forgeDebug({ scope: "capabilities-runtime", level: "warn", message: "changeAgentRole: role not found", context: { roleId: input.roleId } });
    throw new Error(`Role not found: ${input.roleId}`);
  }

  try {
    await input.db
      .update(agents)
      .set({
        roleId: input.roleId,
        updatedAt: Date.now(),
      })
      .where(eq(agents.id, input.targetAgentId));
  } catch (err) {
    forgeDebug({ scope: 'capabilities-runtime', level: 'error', message: 'changeAgentRole update failed', context: { targetAgentId: input.targetAgentId, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }

  forgeDebug({ scope: 'capabilities-runtime', level: 'info', message: 'Changing agent role', context: { actorAgentId: input.actorAgentId, targetAgentId: input.targetAgentId, roleId: input.roleId } });

  await updateInternalChatProviderProfile(input.db, {
    agentId: input.targetAgentId,
    displayName: targetAgent.name,
    description: agentRole.description ?? agentRole.name,
  });

  const notifications = createAgentNotificationStore(input.db);
  const actorLabel = input.actorAgentId === input.targetAgentId ? `${actorAgent.name} (self)` : actorAgent.name;
  const changeTimestamp = Date.now();
  const eventContent = createRoleChangeContent({
    targetAgentId: input.targetAgentId,
    roleId: agentRole.id,
    roleName: agentRole.name,
    changedBy: actorLabel,
    changedByAgentId: input.actorAgentId,
    timestamp: changeTimestamp,
  });

  await notifications.createNotification({
    agentId: input.targetAgentId,
    content: eventContent,
  });

  await reloadAgentIfLoaded(input.db, input.loaderConfig, input.targetAgentId);

  const targetEntry = getInternalAgentRegistry().get(input.targetAgentId);
  targetEntry?.runner.notifyExternalEvent({
    type: 'role-change',
    groupKey: `role-change:${input.targetAgentId}`,
    groupMetadata: {
      source: 'capabilities',
      targetAgentId: input.targetAgentId,
    },
    idempotencyKey: `role-change:${input.targetAgentId}:${changeTimestamp}`,
    text: eventContent,
    timestamp: changeTimestamp,
  });

  forgeDebug({ scope: 'capabilities-runtime', level: 'info', message: 'Agent role changed', context: { targetAgentId: input.targetAgentId, roleId: agentRole.id, roleName: agentRole.name } });

  return {
    agentId: input.targetAgentId,
    roleId: agentRole.id,
    roleName: agentRole.name,
    changedByAgentId: input.actorAgentId,
  };
}

export async function changeAgentRoleFromAdmin(input: {
  db: Database;
  loaderConfig: AgentLoaderConfig;
  targetAgentId: string;
  roleId: string;
}) {
  const targetAgent = await input.db.query.agents.findFirst({
    where: eq(agents.id, input.targetAgentId),
  });

  if (!targetAgent) {
    forgeDebug({ scope: "capabilities-runtime", level: "warn", runtimeId: input.targetAgentId, message: "changeAgentRole: target agent not found" });
    throw new Error(`Target agent not found: ${input.targetAgentId}`);
  }

  const agentRole = await input.db.query.agentRoles.findFirst({
    where: eq(agentRoles.id, input.roleId),
  });

  if (!agentRole) {
    forgeDebug({ scope: "capabilities-runtime", level: "warn", message: "changeAgentRole: role not found", context: { roleId: input.roleId } });
    throw new Error(`Role not found: ${input.roleId}`);
  }

  forgeDebug({ scope: 'capabilities-runtime', level: 'info', message: 'Changing agent role from admin', context: { targetAgentId: input.targetAgentId, roleId: input.roleId } });

  await input.db
    .update(agents)
    .set({
      roleId: input.roleId,
      updatedAt: Date.now(),
    })
    .where(eq(agents.id, input.targetAgentId));

  await updateInternalChatProviderProfile(input.db, {
    agentId: input.targetAgentId,
    displayName: targetAgent.name,
    description: agentRole.description ?? agentRole.name,
  });

  const notifications = createAgentNotificationStore(input.db);
  const changeTimestamp = Date.now();
  const eventContent = createRoleChangeContent({
    targetAgentId: input.targetAgentId,
    roleId: agentRole.id,
    roleName: agentRole.name,
    changedBy: 'admin console',
    timestamp: changeTimestamp,
  });

  await notifications.createNotification({
    agentId: input.targetAgentId,
    content: eventContent,
  });

  await reloadAgentIfLoaded(input.db, input.loaderConfig, input.targetAgentId);

  const targetEntry = getInternalAgentRegistry().get(input.targetAgentId);
  targetEntry?.runner.notifyExternalEvent({
    type: 'role-change',
    groupKey: `role-change:${input.targetAgentId}`,
    groupMetadata: {
      source: 'admin-console',
      targetAgentId: input.targetAgentId,
    },
    idempotencyKey: `role-change:${input.targetAgentId}:${changeTimestamp}`,
    text: eventContent,
    timestamp: changeTimestamp,
  });

  forgeDebug({ scope: 'capabilities-runtime', level: 'info', message: 'Agent role changed from admin', context: { targetAgentId: input.targetAgentId, roleId: agentRole.id, roleName: agentRole.name } });

  return {
    agentId: input.targetAgentId,
    roleId: agentRole.id,
    roleName: agentRole.name,
    changedBy: 'admin-console',
  };
}

export async function updateInternalChatProviderProfile(
  db: Database,
  input: {
    agentId: string;
    displayName: string;
    description: string;
  },
) {
  const provider = await db.query.agentProviders.findFirst({
    where: and(eq(agentProviders.agentId, input.agentId), eq(agentProviders.providerType, 'internal-chat')),
  });

  if (!provider) {
    forgeDebug({ scope: 'capabilities-runtime', level: 'debug', message: 'No internal-chat provider found for agent', context: { agentId: input.agentId } });
    return;
  }

  let credentials: { agentId: string; displayName?: string; description?: string };
  try {
    const decryptedCredentials = decryptSecret(provider.encryptedCredentials);
    credentials = JSON.parse(decryptedCredentials) as {
      agentId: string;
      displayName?: string;
      description?: string;
    };
  } catch (err) {
    forgeDebug({ scope: 'capabilities-runtime', level: 'error', message: `updateInternalChatProviderProfile: failed to decrypt/parse credentials for agent ${input.agentId}: ${String(err)}` });
    return;
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
    forgeDebug({ scope: 'capabilities-runtime', level: 'info', message: 'Internal chat provider profile updated', context: { agentId: input.agentId } });
  } catch (err) {
    forgeDebug({ scope: 'capabilities-runtime', level: 'error', message: `updateInternalChatProviderProfile: failed to update provider for agent ${input.agentId}: ${String(err)}` });
    return;
  }
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

  if (input.changedByAgentId) {
    lines.push(`Changed by agent id: ${input.changedByAgentId}`);
  }

  return lines.join('\n');
}
