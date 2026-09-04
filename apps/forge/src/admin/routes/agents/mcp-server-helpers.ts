import { eq, and } from 'drizzle-orm';
import type { Database } from '../../../database/client';
import { mcpServerConfigs, agentMcpConfigs, NewMcpServerConfig } from '../../../database/schema';
import { normalizeOptionalText } from '../helpers';
// schemas imported inline below

// File-private parser: returns parsed JS value (array/object) or null. Differs from
// normalizeJsonText (which JSON.stringifies for DB storage) — callers here expose the
// parsed shape via API contract.
function safeParseJsonField(value: string | undefined): unknown {
  if (!value || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

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
    command: body.transport === 'stdio' ? (body.command ?? null) : null,
    args: body.transport === 'stdio' ? safeParseJsonField(body.argsText) : null,
    envVars: body.transport === 'stdio' ? safeParseJsonField(body.envVarsText) : null,
    url: body.transport === 'http_streamable' ? (body.url ?? null) : null,
    headers: body.transport === 'http_streamable' ? safeParseJsonField(body.headersText) : null,
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

  // D34 L#NN-50 #36: agentId safety where clause added (handler in #6214 had this; helper didn't).
  await db
    .update(agentMcpConfigs)
    .set({
      isActive: body.isActive !== undefined ? (body.isActive ? 1 : 0) : undefined,
      updatedAt: now,
    })
    .where(and(eq(agentMcpConfigs.id, body.configId), eq(agentMcpConfigs.agentId, body.agentId)));
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
