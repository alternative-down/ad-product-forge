import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';

import type { Database } from '../database/client';
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

export async function changeAgentRole(input: {
  db: Database;
  loaderConfig: AgentLoaderConfig;
  actorAgentId: string;
  targetAgentId: string;
  roleId: string;
}) {
  const actorAgent = await input.db.query.agents.findFirst({
    where: eq(agents.id, input.actorAgentId),
  });

  if (actorAgent === undefined) {
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'warn',
      message: 'changeAgentRole: actor agent not found',
      context: { actorAgentId: input.actorAgentId },
    });
    throw new Error(`Actor agent not found: ${input.actorAgentId}`);
  }

  const targetAgent = await input.db.query.agents.findFirst({
    where: eq(agents.id, input.targetAgentId),
  });

  if (targetAgent === undefined) {
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'warn',
      message: 'changeAgentRole: target agent not found',
      context: { targetAgentId: input.targetAgentId },
    });
    throw new Error(`Target agent not found: ${input.targetAgentId}`);
  }

  const agentRole = await input.db.query.agentRoles.findFirst({
    where: eq(agentRoles.id, input.roleId),
  });

  if (agentRole === undefined) {
    throw new Error(`Role not found: ${input.roleId}`);
  }

  await input.db
    .update(agents)
    .set({
      roleId: input.roleId,
      updatedAt: Date.now(),
    })
    .where(eq(agents.id, input.targetAgentId));

  forgeDebug({
    scope: 'capabilities-runtime',
    level: 'info',
    message: 'Changing agent role',
    context: {
      actorAgentId: input.actorAgentId,
      targetAgentId: input.targetAgentId,
      roleId: input.roleId,
    },
  });

  await updateInternalChatProviderProfile(input.db, {
    agentId: input.targetAgentId,
    displayName: targetAgent.name,
    description: agentRole.description ?? agentRole.name,
  });

  const notifications = createAgentNotificationStore(input.db);
  const actorLabel =
    input.actorAgentId === input.targetAgentId ? `${actorAgent.name} (self)` : actorAgent.name;
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
  targetEntry?.runner?.notifyExternalEvent({
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

  forgeDebug({
    scope: 'capabilities-runtime',
    level: 'info',
    message: 'Agent role changed',
    context: { targetAgentId: input.targetAgentId, roleId: agentRole.id, roleName: agentRole.name },
  });

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

  if (targetAgent === undefined) {
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'warn',
      message: 'changeAgentRole: target agent not found',
      context: { targetAgentId: input.targetAgentId },
    });
    throw new Error(`Target agent not found: ${input.targetAgentId}`);
  }

  const agentRole = await input.db.query.agentRoles.findFirst({
    where: eq(agentRoles.id, input.roleId),
  });

  if (agentRole === undefined) {
    throw new Error(`Role not found: ${input.roleId}`);
  }

  forgeDebug({
    scope: 'capabilities-runtime',
    level: 'info',
    message: 'Changing agent role from admin',
    context: { targetAgentId: input.targetAgentId, roleId: input.roleId },
  });

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
  targetEntry?.runner?.notifyExternalEvent({
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

  forgeDebug({
    scope: 'capabilities-runtime',
    level: 'info',
    message: 'Agent role changed from admin',
    context: { targetAgentId: input.targetAgentId, roleId: agentRole.id, roleName: agentRole.name },
  });

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
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'error',
      message: `updateInternalChatProviderProfile: failed to decrypt/parse credentials for agent ${input.agentId}: ${errorMsg(err)}`,
    });
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
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'info',
      message: 'Internal chat provider profile updated',
      context: { agentId: input.agentId },
    });
  } catch (err) {
    forgeDebug({
      scope: 'capabilities-runtime',
      level: 'error',
      message: `updateInternalChatProviderProfile: failed to update provider for agent ${input.agentId}: ${errorMsg(err)}`,
    });
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

  if (input.changedByAgentId !== null && input.changedByAgentId !== undefined) {
    lines.push(`Changed by agent id: ${input.changedByAgentId}`);
  }

  return lines.join('\n');
}
