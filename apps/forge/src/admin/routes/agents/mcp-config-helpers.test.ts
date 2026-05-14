import { describe, expect, it, vi } from 'vitest';
import { agentMcpConfigs } from '../../../database/schema';
import { assignAgentMcpServer, setMcpServerActive, detachMcpServer } from './mcp-config-helpers';

vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));
vi.mock('../../../utils/id', () => ({ createId: vi.fn().mockReturnValue('generated-id') }));
vi.mock('../../../database/client', () => ({}));

describe('assignAgentMcpServer', () => {
  it('inserts new config when no existing link found', async () => {
    const updateMock = vi.fn().mockReturnThis();
    updateMock.where = vi.fn().mockResolvedValue(undefined);
    const insertMock = vi.fn().mockResolvedValue(undefined);
    const findFirstMock = vi.fn().mockResolvedValue(null);
    const db = {
      query: { agentMcpConfigs: { findFirst: findFirstMock } },
      update: updateMock,
      insert: insertMock,
    } as any;

    const result = await assignAgentMcpServer(db, 'agent-1', 'server-1', true);

    expect(findFirstMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalled();
    expect(result.isNew).toBe(true);
    expect(result.configId).toBe('generated-id');
  });

  it('updates existing config when link found', async () => {
    const updateMock = vi.fn().mockReturnThis();
    updateMock.where = vi.fn().mockResolvedValue(undefined);
    const findFirstMock = vi.fn().mockResolvedValue({ id: 'existing-config', agentId: 'agent-1', serverId: 'server-1' });
    const db = {
      query: { agentMcpConfigs: { findFirst: findFirstMock } },
      update: updateMock,
    } as any;

    const result = await assignAgentMcpServer(db, 'agent-1', 'server-1', false);

    expect(updateMock).toHaveBeenCalled();
    expect(result.isNew).toBe(false);
    expect(result.configId).toBe('existing-config');
  });

  it('defaults isActive to true', async () => {
    const updateMock = vi.fn().mockReturnThis();
    updateMock.where = vi.fn().mockResolvedValue(undefined);
    const insertMock = vi.fn().mockResolvedValue(undefined);
    const findFirstMock = vi.fn().mockResolvedValue(null);
    const db = {
      query: { agentMcpConfigs: { findFirst: findFirstMock } },
      update: updateMock,
      insert: insertMock,
    } as any;

    await assignAgentMcpServer(db, 'agent-1', 'server-1');

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: 1 }),
    );
  });
});

describe('setMcpServerActive', () => {
  it('updates agentMcpConfigs with isActive=1', async () => {
    const updateMock = vi.fn().mockReturnThis();
    updateMock.where = vi.fn().mockResolvedValue(undefined);
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
    const updateMock = vi.fn().mockReturnThis();
    updateMock.where = vi.fn().mockResolvedValue(undefined);
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
    const deleteMock = vi.fn().mockReturnThis();
    deleteMock.where = vi.fn().mockResolvedValue(undefined);
    const findFirstMock = vi.fn().mockResolvedValue({ id: 'config-1', agentId: 'agent-1' });
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
    const deleteMock = vi.fn().mockReturnThis();
    deleteMock.where = vi.fn().mockResolvedValue(undefined);
    const findFirstMock = vi.fn().mockResolvedValue(null);
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