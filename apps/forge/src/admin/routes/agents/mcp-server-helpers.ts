import { eq, and } from 'drizzle-orm';
import type { Database } from '../../../database/client';
import { mcpServerConfigs, agentMcpConfigs, NewMcpServerConfig } from '../../../database/schema';
import { normalizeJsonText, normalizeOptionalText } from '../helpers';
// schemas imported inline below

export function normalizeMcpServerRecord(body: {
  name?: string;
  description?: string;
  transport?: 'stdio' | 'http_streamable';
  command?: string;
  argsText?: string;
  envVarsText?: string;
  url?: string;
  headersText?: string;
  isActive?: boolean;
}) {
  return {
    name: body.name,
    description: normalizeOptionalText(body.description),
    transport: body.transport,
    command: body.transport === 'stdio' ? body.command : null,
    args: body.transport === 'stdio' ? normalizeJsonText(body.argsText, 'argsText', 'array') : null,
    envVars:
      body.transport === 'stdio'
        ? normalizeJsonText(body.envVarsText, 'envVarsText', 'object')
        : null,
    url: body.transport === 'http_streamable' ? body.url : null,
    headers:
      body.transport === 'http_streamable'
        ? normalizeJsonText(body.headersText, 'headersText', 'object')
        : null,
  };
}

export async function createAgentMcpServer(
  db: Database,
  agentId: string,
  serverId: string,
  configId: string,
  body: {
    name: string;
    transport: 'stdio' | 'http_streamable';
    command?: string;
    argsText?: string;
    envVarsText?: string;
    url?: string;
    headersText?: string;
    isActive?: boolean;
  },
) {
  const now = Date.now();
  const record = normalizeMcpServerRecord({ ...body, isActive: body.isActive ?? false });

  await db.insert(mcpServerConfigs).values({
    id: serverId,
    ...record,
    version: 1,
    isActive: body.isActive === true ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  } as NewMcpServerConfig);

  await db.insert(agentMcpConfigs).values({
    id: configId,
    agentId,
    serverId,
    isActive: body.isActive === true ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateAgentMcpServer(
  db: Database,
  body: {
    configId: string;
    agentId: string;
    serverId: string;
    name?: string;
    transport?: 'stdio' | 'http_streamable';
    command?: string;
    argsText?: string;
    envVarsText?: string;
    url?: string;
    headersText?: string;
    isActive?: boolean;
  },
) {
  const now = Date.now();
  const record = normalizeMcpServerRecord({ ...body, isActive: body.isActive ?? false });

  await db
    .update(mcpServerConfigs)
    .set({
      ...record,
      isActive: body.isActive !== undefined ? (body.isActive ? 1 : 0) : undefined,
      updatedAt: now,
    })
    .where(eq(mcpServerConfigs.id, body.serverId));

  await db
    .update(agentMcpConfigs)
    .set({
      isActive: body.isActive !== undefined ? (body.isActive ? 1 : 0) : undefined,
      updatedAt: now,
    })
    .where(eq(agentMcpConfigs.id, body.configId));
}

export async function deleteAgentMcpServer(
  db: Database,
  configId: string,
  agentId: string,
  serverId: string,
) {
  await db
    .delete(agentMcpConfigs)
    .where(and(eq(agentMcpConfigs.id, configId), eq(agentMcpConfigs.agentId, agentId)));

  const remainingLinks = await db.query.agentMcpConfigs.findMany({
    where: eq(agentMcpConfigs.serverId, serverId),
    columns: { id: true },
  });

  if (remainingLinks.length === 0) {
    await db.delete(mcpServerConfigs).where(eq(mcpServerConfigs.id, serverId));
  }
}
