import type { Database } from '../database/index.js';
import { and, eq, inArray } from 'drizzle-orm';

import { agents, agentProviders, agentFunctions, functionRoles } from '../database/schema.js';
import { loadAgent, type AgentLoaderConfig } from '../agents/agent-loader.js';
import { getInternalAgentRegistry } from '../agents/internal-agent-registry.js';
import { createAgentNotificationStore } from '../notifications/store.js';
import { decryptSecret, encryptSecret } from '../encryption/crypto.js';

export async function reloadAgentIfLoaded(db: Database, config: AgentLoaderConfig, agentId: string) {
  const registry = getInternalAgentRegistry();

  if (!registry.get(agentId)) {
    return;
  }

  const runtime = await loadAgent(db, {
    ...config,
    agentId,
  });

  await registry.add(db, runtime);
}

export async function reloadAgentsForFunction(db: Database, config: AgentLoaderConfig, functionId: string) {
  const assignedAgents = await db.query.agents.findMany({
    where: eq(agents.functionId, functionId),
    columns: {
      id: true,
    },
  });

  for (const agent of assignedAgents) {
    await reloadAgentIfLoaded(db, config, agent.id);
  }
}

export async function reloadAgentsForRole(db: Database, config: AgentLoaderConfig, roleId: string) {
  const linkedFunctions = await db.query.functionRoles.findMany({
    where: eq(functionRoles.roleId, roleId),
    columns: {
      functionId: true,
    },
  });

  if (linkedFunctions.length === 0) {
    return;
  }

  const functionIds = linkedFunctions.map((link) => link.functionId);
  const assignedAgents = await db.query.agents.findMany({
    where: inArray(agents.functionId, functionIds),
    columns: {
      id: true,
    },
  });

  for (const agent of assignedAgents) {
    await reloadAgentIfLoaded(db, config, agent.id);
  }
}

export async function changeAgentFunction(input: {
  db: Database;
  loaderConfig: AgentLoaderConfig;
  actorAgentId: string;
  targetAgentId: string;
  functionId: string;
}) {
  const actorAgent = await input.db.query.agents.findFirst({
    where: eq(agents.id, input.actorAgentId),
  });

  if (!actorAgent) {
    throw new Error(`Actor agent not found: ${input.actorAgentId}`);
  }

  const targetAgent = await input.db.query.agents.findFirst({
    where: eq(agents.id, input.targetAgentId),
  });

  if (!targetAgent) {
    throw new Error(`Target agent not found: ${input.targetAgentId}`);
  }

  const agentFunction = await input.db.query.agentFunctions.findFirst({
    where: eq(agentFunctions.id, input.functionId),
  });

  if (!agentFunction) {
    throw new Error(`Function not found: ${input.functionId}`);
  }

  await input.db
    .update(agents)
    .set({
      functionId: input.functionId,
      updatedAt: Date.now(),
    })
    .where(eq(agents.id, input.targetAgentId));

  await updateInternalChatProviderProfile(input.db, {
    agentId: input.targetAgentId,
    displayName: targetAgent.name,
    description: agentFunction.description ?? agentFunction.name,
  });

  const notifications = createAgentNotificationStore(input.db);
  const actorLabel = input.actorAgentId === input.targetAgentId ? `${actorAgent.name} (self)` : actorAgent.name;

  await notifications.createNotification({
    agentId: input.targetAgentId,
    content: `Function changed to "${agentFunction.name}" by ${actorLabel}.`,
  });

  await reloadAgentIfLoaded(input.db, input.loaderConfig, input.targetAgentId);

  const targetEntry = getInternalAgentRegistry().get(input.targetAgentId);
  targetEntry?.runner.notifyExternalEvent();

  return {
    agentId: input.targetAgentId,
    functionId: agentFunction.id,
    functionName: agentFunction.name,
    changedByAgentId: input.actorAgentId,
  };
}

export async function changeAgentFunctionFromAdmin(input: {
  db: Database;
  loaderConfig: AgentLoaderConfig;
  targetAgentId: string;
  functionId: string;
}) {
  const targetAgent = await input.db.query.agents.findFirst({
    where: eq(agents.id, input.targetAgentId),
  });

  if (!targetAgent) {
    throw new Error(`Target agent not found: ${input.targetAgentId}`);
  }

  const agentFunction = await input.db.query.agentFunctions.findFirst({
    where: eq(agentFunctions.id, input.functionId),
  });

  if (!agentFunction) {
    throw new Error(`Function not found: ${input.functionId}`);
  }

  await input.db
    .update(agents)
    .set({
      functionId: input.functionId,
      updatedAt: Date.now(),
    })
    .where(eq(agents.id, input.targetAgentId));

  await updateInternalChatProviderProfile(input.db, {
    agentId: input.targetAgentId,
    displayName: targetAgent.name,
    description: agentFunction.description ?? agentFunction.name,
  });

  const notifications = createAgentNotificationStore(input.db);

  await notifications.createNotification({
    agentId: input.targetAgentId,
    content: `Function changed to "${agentFunction.name}" by admin console.`,
  });

  await reloadAgentIfLoaded(input.db, input.loaderConfig, input.targetAgentId);

  const targetEntry = getInternalAgentRegistry().get(input.targetAgentId);
  targetEntry?.runner.notifyExternalEvent();

  return {
    agentId: input.targetAgentId,
    functionId: agentFunction.id,
    functionName: agentFunction.name,
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
    return;
  }

  const decryptedCredentials = decryptSecret(provider.encryptedCredentials);
  const credentials = JSON.parse(decryptedCredentials) as {
    agentId: string;
    displayName?: string;
    description?: string;
  };

  const nextCredentials = {
    ...credentials,
    agentId: input.agentId,
    displayName: input.displayName,
    description: input.description,
  };

  await db
    .update(agentProviders)
    .set({
      encryptedCredentials: encryptSecret(JSON.stringify(nextCredentials)),
    })
    .where(eq(agentProviders.id, provider.id));
}
