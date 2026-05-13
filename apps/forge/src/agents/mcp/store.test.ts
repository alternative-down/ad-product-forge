 
import { describe, expect, it, test, vi, beforeEach } from 'vitest';
import {
  createMcpServerConfig,
  getMcpServerConfig,
  listMcpServerConfigs,
  updateMcpServerConfig,
  deleteMcpServerConfig,
  searchMcpServerConfigs,
  createAgentMcpConfig,
  getAgentMcpConfig,
  listAgentMcpConfigs,
  updateAgentMcpConfig,
  deleteAgentMcpConfig,
} from './store';

// ─── module-level mocks ────────────────────────────────────────────────────────
vi.mock('../../database/client', () => ({
  getDatabase: vi.fn(),
}));

vi.mock('../../utils/id', () => ({
  createId: vi.fn(() => 'mock-nanoid-id'),
}));

import { getDatabase } from '../../database/client';

// Builds a drizzle-like query chain that works with both "no filter" and
// ".where()" code paths.
//
// "No filter" path (e.g. listMcpServerConfigs()):
//   db.select().from(table)
//   → await resolves directly to rows
//
// "With filter" path (e.g. getMcpServerConfig(), listMcpServerConfigs({isActive})):
//   db.select().from(table).where(...)
//   → .where() is a thenable that also resolves to rows
//
// searchMcpServerConfigs() also uses .limit():
//   db.select().from(table).where(...).limit(...)
//   → .limit() is a thenable that resolves to rows
//
// Object.assign(Promise.resolve(rows), { where: fn }) creates an object that
// is BOTH a resolved Promise (await returns rows) AND has an own .where()
// property that Vitest can spy/stub (unlike plain Promise which drops own
// properties after await).
function makeMockDb(rows: unknown[] = []) {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() =>
        Object.assign(Promise.resolve(rows), {
          where: vi.fn(() => Object.assign(Promise.resolve(rows), {
            limit: vi.fn(() => Promise.resolve(rows)),
          })),
        }),
      ),
    })),
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
      onConflictDoNothing: vi.fn().mockReturnThis(),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };
  (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(db);
  return db;
}

// Reset state between tests.
beforeEach(() => {
  vi.clearAllMocks();
  makeMockDb([]);
});

// ─── MCP Server Config tests ──────────────────────────────────────────────────
describe('createMcpServerConfig', () => {
  test('inserts config with generated id and timestamps', async () => {
    const db = makeMockDb();

    const result = await createMcpServerConfig({
      name: 'test-server',
      transport: 'stdio',
      command: 'npx',
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result.id).toBe('mock-nanoid-id');
    expect(result.name).toBe('test-server');
    expect(result.transport).toBe('stdio');
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
  });
});

describe('getMcpServerConfig', () => {
  test('returns config when found', async () => {
    makeMockDb([{ id: 'server-1', name: 'test-server' }]);

    const result = await getMcpServerConfig('server-1');

    expect(result).toEqual({ id: 'server-1', name: 'test-server' });
  });

  test('returns undefined when not found', async () => {
    makeMockDb([]);

    const result = await getMcpServerConfig('nonexistent');

    expect(result).toBeUndefined();
  });
});

describe('listMcpServerConfigs', () => {
  test('returns all configs when no filter', async () => {
    makeMockDb([
      { id: 'server-1', name: 'server-1' },
      { id: 'server-2', name: 'server-2' },
    ]);

    const result = await listMcpServerConfigs();

    expect(result).toHaveLength(2);
  });

  test('filters by isActive=true', async () => {
    makeMockDb([{ id: 'server-1', isActive: 1 }]);

    const result = await listMcpServerConfigs({ isActive: true });

    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(1);
  });

  test('filters by isActive=false', async () => {
    makeMockDb([{ id: 'server-2', isActive: 0 }]);

    const result = await listMcpServerConfigs({ isActive: false });

    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(0);
  });
});

describe('updateMcpServerConfig', () => {
  test('updates fields and returns updated config', async () => {
    makeMockDb([{ id: 'server-1', name: 'updated-name' }]);

    const result = await updateMcpServerConfig('server-1', {
      name: 'updated-name',
    });

    expect(result?.name).toBe('updated-name');
  });
});

describe('deleteMcpServerConfig', () => {
  test('deletes config by id', async () => {
    const db = makeMockDb();

    await deleteMcpServerConfig('server-1');

    expect(db.delete).toHaveBeenCalledOnce();
  });
});

describe('searchMcpServerConfigs', () => {
  test('returns matching configs', async () => {
    makeMockDb([{ id: 'server-1', name: 'test-server' }]);

    const result = await searchMcpServerConfigs('test');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('test-server');
  });

  test('returns empty array when no matches', async () => {
    makeMockDb([]);

    const result = await searchMcpServerConfigs('nonexistent');

    expect(result).toHaveLength(0);
  });
});

// ─── Agent MCP Config tests ────────────────────────────────────────────────────
describe('createAgentMcpConfig', () => {
  test('inserts config with generated id and timestamps', async () => {
    const db = makeMockDb();

    const result = await createAgentMcpConfig({
      agentId: 'agent-1',
      serverId: 'server-1',
      isActive: 1,
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result.id).toBe('mock-nanoid-id');
    expect(result.agentId).toBe('agent-1');
    expect(result.serverId).toBe('server-1');
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
  });
});

describe('getAgentMcpConfig', () => {
  test('returns config when found', async () => {
    makeMockDb([{ id: 'agent-config-1', agentId: 'agent-1' }]);

    const result = await getAgentMcpConfig('agent-1' as any);

    expect(result).toEqual({ id: 'agent-config-1', agentId: 'agent-1' });
  });

  test('returns undefined when not found', async () => {
    makeMockDb([]);

    const result = await getAgentMcpConfig('agent-1' as any);

    expect(result).toBeUndefined();
  });
});

describe('listAgentMcpConfigs', () => {
  test('returns all configs for agent', async () => {
    makeMockDb([{ id: 'agent-config-1' }, { id: 'agent-config-2' }]);

    const result = await listAgentMcpConfigs('agent-1');

    expect(result).toHaveLength(2);
  });

  test('filters by isActive=true', async () => {
    makeMockDb([{ id: 'agent-config-1', isActive: 1 }]);

    const result = await listAgentMcpConfigs('agent-1', { isActive: true });

    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(1);
  });

  test('filters by isActive=false', async () => {
    makeMockDb([{ id: 'agent-config-2', isActive: 0 }]);

    const result = await listAgentMcpConfigs('agent-1', { isActive: false });

    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(0);
  });
});

describe('updateAgentMcpConfig', () => {
  test('updates isActive and returns updated config', async () => {
    makeMockDb([{ id: 'agent-config-1', isActive: 0 }]);

    const result = await updateAgentMcpConfig('agent-config-1', {
      isActive: 0,
    });

    expect(result?.isActive).toBe(0);
  });
});

describe('deleteAgentMcpConfig', () => {
  test('deletes config by id', async () => {
    const db = makeMockDb();

    await deleteAgentMcpConfig('agent-config-1');

    expect(db.delete).toHaveBeenCalledOnce();
  });
});
// ─── getAgentMcpServers tests ─────────────────────────────────────────────────

describe('getAgentMcpServers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active MCP server configs for an agent with matching active servers', async () => {
    const mockRows = [
      {
        config: { id: 'cfg-1', agentId: 'agent-1', serverId: 'srv-1', isActive: 1 },
        server: { id: 'srv-1', name: 'Filesystem', command: 'npx', args: [], isActive: 1 },
      },
      {
        config: { id: 'cfg-2', agentId: 'agent-1', serverId: 'srv-2', isActive: 1 },
        server: { id: 'srv-2', name: 'Memory', command: 'node', args: [], isActive: 1 },
      },
    ];

    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() =>
              Object.assign(Promise.resolve(mockRows), {
                where: vi.fn(),
              }),
            ),
          })),
        })),
      })),
    };

    vi.mocked(getDatabase).mockReturnValue(mockDb as any);

    const { getAgentMcpServers } = await import('./store');
    const result = await getAgentMcpServers('agent-1');

    expect(result).toHaveLength(2);
    expect(result[0].config.agentId).toBe('agent-1');
    expect(result[0].server.name).toBe('Filesystem');
  });

  it('returns empty array when agent has no active MCP configs', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() =>
              Object.assign(Promise.resolve([]), { where: vi.fn() }),
            ),
          })),
        })),
      })),
    };

    vi.mocked(getDatabase).mockReturnValue(mockDb as any);

    const { getAgentMcpServers } = await import('./store');
    const result = await getAgentMcpServers('agent-no-configs');

    expect(result).toHaveLength(0);
  });

  it('throws and logs when database query fails', async () => {
    const dbError = new Error('SQLITE_CONSTRAINT');
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => Promise.reject(dbError)),
          })),
        })),
      })),
    };

    vi.mocked(getDatabase).mockReturnValue(mockDb as any);

    const { getAgentMcpServers } = await import('./store');
    await expect(getAgentMcpServers('agent-1')).rejects.toThrow('SQLITE_CONSTRAINT');
  });
});
