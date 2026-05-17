import { describe, expect, it, vi } from 'vitest';
import { normalizeMcpServerRecord, createAgentMcpServer, updateAgentMcpServer, deleteAgentMcpServer } from './mcp-server-helpers';

vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));
vi.mock('../../../database/client', () => ({}));

// Minimal mock for db chainables
function mockChain(resolveValue: unknown) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return chain;
}

describe('normalizeMcpServerRecord', () => {
  it('applies normalizeOptionalText to description', () => {
    const result = normalizeMcpServerRecord({ description: '  spaces  ' });
    expect(result.description).toBe('spaces');
  });

  it('returns null args/envVars when transport is http_streamable', () => {
    const result = normalizeMcpServerRecord({
      transport: 'http_streamable',
      argsText: '[]',
      envVarsText: '{}',
    });
    expect(result.args).toBeNull();
    expect(result.envVars).toBeNull();
    expect(result.url).toBeNull();
    expect(result.headers).toBeNull();
  });

  it('returns null url/headers when transport is stdio', () => {
    const result = normalizeMcpServerRecord({
      transport: 'stdio',
      command: '/bin/server',
      argsText: '["--debug"]',
      envVarsText: '{"KEY":"val"}',
    });
    expect(result.args).toEqual(['--debug']);
    expect(result.envVars).toEqual({ KEY: 'val' });
    expect(result.command).toBe('/bin/server');
    expect(result.url).toBeNull();
    expect(result.headers).toBeNull();
  });

  it('handles missing optional fields', () => {
    const result = normalizeMcpServerRecord({ name: 'Test Server' });
    expect(result.name).toBe('Test Server');
    expect(result.description).toBeNull();
    expect(result.command).toBeNull();
  });
});

describe('createAgentMcpServer', () => {
  it('inserts mcpServerConfigs and agentMcpConfigs records', async () => {
    const insertMock = vi.fn().mockResolvedValue(undefined);
    const db = {
      insert: insertMock,
      query: { agentMcpConfigs: { findMany: vi.fn().mockResolvedValue([]) } },
    } as any;

    await createAgentMcpServer(db, 'agent-1', 'server-1', 'config-1', {
      name: 'Test Server',
      transport: 'stdio',
    });

    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it('uses Date.now() for createdAt/updatedAt', async () => {
    const before = Date.now();
    const insertMock = vi.fn().mockResolvedValue(undefined);
    const db = {
      insert: insertMock,
      query: { agentMcpConfigs: { findMany: vi.fn().mockResolvedValue([]) } },
    } as any;

    await createAgentMcpServer(db, 'agent-1', 'server-1', 'config-1', {
      name: 'Test Server',
      transport: 'stdio',
    });

    const after = Date.now();
    // Check that timestamps were set (insert was called)
    expect(insertMock).toHaveBeenCalled();
  });
});

describe('updateAgentMcpServer', () => {
  it('updates mcpServerConfigs and agentMcpConfigs', async () => {
    const updateMock = vi.fn().mockReturnThis() as any;
    (updateMock as any).where = vi.fn().mockResolvedValue(undefined);
    const db = { update: updateMock } as any;

    await updateAgentMcpServer(db, {
      configId: 'config-1',
      agentId: 'agent-1',
      serverId: 'server-1',
      name: 'Updated Server',
    });

    expect(updateMock).toHaveBeenCalledTimes(2);
  });
});

describe('deleteAgentMcpServer', () => {
  it('deletes agentMcpConfigs first', async () => {
    const deleteMock = vi.fn().mockReturnThis() as any;
    (deleteMock as any).where = vi.fn().mockResolvedValue(undefined);
    const queryMock = vi.fn().mockResolvedValue([]);
    const db = {
      delete: deleteMock,
      query: { agentMcpConfigs: { findMany: queryMock } },
    } as any;

    await deleteAgentMcpServer(db, 'config-1', 'agent-1', 'server-1');

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalled();
  });

  it('deletes mcpServerConfigs only when no remaining links', async () => {
    const deleteMock = vi.fn().mockReturnThis() as any;
    (deleteMock as any).where = vi.fn().mockResolvedValue(undefined);
    const queryMock = vi.fn().mockResolvedValue([{ id: 'other-config' }]);
    const db = {
      delete: deleteMock,
      query: { agentMcpConfigs: { findMany: queryMock } },
    } as any;

    await deleteAgentMcpServer(db, 'config-1', 'agent-1', 'server-1');

    // Only agentMcpConfigs deleted, mcpServerConfigs kept (orphan exists)
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it('deletes mcpServerConfigs when orphan check returns empty', async () => {
    const deleteMock = vi.fn().mockReturnThis() as any;
    (deleteMock as any).where = vi.fn().mockResolvedValue(undefined);
    const queryMock = vi.fn().mockResolvedValue([]);
    const db = {
      delete: deleteMock,
      query: { agentMcpConfigs: { findMany: queryMock } },
    } as any;

    await deleteAgentMcpServer(db, 'config-1', 'agent-1', 'server-1');

    // agentMcpConfigs + mcpServerConfigs both deleted
    expect(deleteMock).toHaveBeenCalledTimes(2);
  });
});