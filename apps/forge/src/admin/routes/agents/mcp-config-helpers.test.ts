import { describe, expect, it, vi } from 'vitest';
import { agentMcpConfigs } from '../../../database/schema';
import { assignAgentMcpServer, setMcpServerActive, detachMcpServer } from './mcp-config-helpers';

vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));
vi.mock('../../../utils/id', () => ({ createId: vi.fn().mockReturnValue('generated-id') }));
vi.mock('../../../database/client', () => ({}));

describe('assignAgentMcpServer', () => {
  // Helper: chainable mock matching drizzle's db.insert().values().onConflictDoUpdate()
  function makeDb() {
    const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
    return { insertMock, valuesMock, onConflictDoUpdateMock, db: { insert: insertMock } as any };
  }

  it('uses atomic onConflictDoUpdate with composite [agentId, serverId] target', async () => {
    const { insertMock, onConflictDoUpdateMock, db } = makeDb();

    const result = await assignAgentMcpServer(db, 'agent-1', 'server-1', true);

    // Atomic upsert: single insert + onConflictDoUpdate (NOT findFirst+update)
    expect(insertMock).toHaveBeenCalledWith(agentMcpConfigs);
    expect(onConflictDoUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [agentMcpConfigs.agentId, agentMcpConfigs.serverId],
        set: expect.objectContaining({ isActive: 1 }),
      }),
    );
    expect(result.isNew).toBe(true);
    expect(result.configId).toBe('generated-id');
  });

  it('uses atomic onConflictDoUpdate for existing link (no separate update call)', async () => {
    // Regression: OLD code did findFirst → update on existing; NEW code always uses
    // atomic insert+onConflictDoUpdate, so concurrent calls cannot race.
    const { insertMock, onConflictDoUpdateMock, db } = makeDb();

    await assignAgentMcpServer(db, 'agent-1', 'server-1', false);

    // Single atomic statement — the "update when existing" path is collapsed into
    // the onConflictDoUpdate clause. db.update is never called for upserts.
    expect(insertMock).toHaveBeenCalled();
    expect(onConflictDoUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ isActive: 0 }),
      }),
    );
  });

  it('defaults isActive to true (1) in the inserted values', async () => {
    const { valuesMock, db } = makeDb();

    await assignAgentMcpServer(db, 'agent-1', 'server-1');

    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ isActive: 1 }));
  });
});

describe('setMcpServerActive', () => {
  it('updates agentMcpConfigs with isActive=1', async () => {
    const updateMock = (vi.fn() as any).mockReturnThis();
    updateMock.where = (vi.fn() as any).mockResolvedValue(undefined);
    const db = { update: updateMock } as any;

    await setMcpServerActive(db, 'config-1', 'agent-1', true);

    expect(updateMock).toHaveBeenCalledWith(agentMcpConfigs);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ isActive: 1 }),
      }),
    );
  });

  it('updates agentMcpConfigs with isActive=0', async () => {
    const updateMock = (vi.fn() as any).mockReturnThis();
    updateMock.where = (vi.fn() as any).mockResolvedValue(undefined);
    const db = { update: updateMock } as any;

    await setMcpServerActive(db, 'config-1', 'agent-1', false);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ isActive: 0 }),
      }),
    );
  });
});

describe('detachMcpServer', () => {
  it('deletes config and returns true when config exists', async () => {
    const deleteMock = (vi.fn() as any).mockReturnThis();
    deleteMock.where = (vi.fn() as any).mockResolvedValue(undefined);
    const findFirstMock = (vi.fn() as any).mockResolvedValue({
      id: 'config-1',
      agentId: 'agent-1',
    });
    const db = {
      query: { agentMcpConfigs: { findFirst: findFirstMock } },
      delete: deleteMock,
    } as any;

    const result = await detachMcpServer(db, 'config-1', 'agent-1');

    expect(findFirstMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('returns false without deleting when config not found', async () => {
    const deleteMock = (vi.fn() as any).mockReturnThis();
    deleteMock.where = (vi.fn() as any).mockResolvedValue(undefined);
    const findFirstMock = (vi.fn() as any).mockResolvedValue(null);
    const db = {
      query: { agentMcpConfigs: { findFirst: findFirstMock } },
      delete: deleteMock,
    } as any;

    const result = await detachMcpServer(db, 'config-1', 'agent-1');

    expect(findFirstMock).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});
