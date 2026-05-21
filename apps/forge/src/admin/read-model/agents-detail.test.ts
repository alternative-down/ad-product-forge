import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAgentDetailReadModel } from './agents-detail';

const mockForgeDebug = vi.hoisted(() => {
  const fn = vi.fn();
  return fn;
});

const mockToScheduleSummary = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockReturnValue({
    id: 's1',
    nextTriggerAt: 0,
    cron: '0 * * * *',
    enabled: true,
    lastTriggerAt: null,
  });
  return fn;
});

vi.mock('@forge-runtime/core', () => ({ forgeDebug: mockForgeDebug }));
vi.mock('./helpers', () => ({ toScheduleSummary: mockToScheduleSummary }));

function makeMockDb(overrides = {}) {
  // NOTE: LibSQLDatabase type has dozens of methods; type cast bypasses TS2740
  // The read model only uses query.* methods at runtime
  return {
    query: {
      agents: { findFirst: vi.fn().mockResolvedValue(null) },
      agentExecutionContracts: { findMany: vi.fn().mockResolvedValue([]) },
      agentSchedules: { findMany: vi.fn().mockResolvedValue([]) },
      agentNotifications: { findMany: vi.fn().mockResolvedValue([]) },
      agentMcpConfigs: { findMany: vi.fn().mockResolvedValue([]) },
      mcpServerConfigs: { findMany: vi.fn().mockResolvedValue([]) },
      llmProfiles: { findMany: vi.fn().mockResolvedValue([]) },
    },
    ...overrides,
  } as any;
}

describe('createAgentDetailReadModel', () => {
  beforeEach(() => {
    mockForgeDebug.mockReset();
    mockToScheduleSummary.mockReset();
    mockToScheduleSummary.mockReturnValue({
      id: 's1',
      nextTriggerAt: 0,
      cron: '0 * * * *',
      enabled: true,
      lastTriggerAt: null,
    });
  });

  describe('listAgentContracts', () => {
    it('returns empty array when no contracts exist', async () => {
      const db = makeMockDb({
        query: { agentExecutionContracts: { findMany: vi.fn().mockResolvedValue([]) } },
      });
      const model = createAgentDetailReadModel({ db });
      expect(await model.listAgentContracts('agent-1')).toEqual([]);
    });

    it('maps id to contractId and strips id', async () => {
      const contracts = [
        { id: 'contract-1', startsAt: 1234, endsAt: 5678, status: 'active' },
        { id: 'contract-2', startsAt: 2345, endsAt: 6789, status: 'expired' },
      ];
      const db = makeMockDb({
        query: { agentExecutionContracts: { findMany: vi.fn().mockResolvedValue(contracts) } },
      });
      const model = createAgentDetailReadModel({ db });
      const result = await model.listAgentContracts('agent-1');
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('contractId', 'contract-1');
      expect(result[0]).not.toHaveProperty('id');
    });

    it('throws and logs forgeDebug on DB error', async () => {
      const db = makeMockDb({
        query: {
          agentExecutionContracts: { findMany: vi.fn().mockRejectedValue(new Error('DB failed')) },
        },
      });
      const model = createAgentDetailReadModel({ db });
      await expect(model.listAgentContracts('agent-1')).rejects.toThrow('DB failed');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('listAgentContracts'),
        }),
      );
    });
  });

  describe('listAgentSchedules', () => {
    it('returns empty array when no schedules exist', async () => {
      const db = makeMockDb();
      const model = createAgentDetailReadModel({ db });
      expect(await model.listAgentSchedules('agent-1')).toEqual([]);
    });

    it('maps rows through toScheduleSummary', async () => {
      const rows = [
        { id: 's1', agentId: 'a1', cronExpression: '0 * * * *', nextTriggerAt: 99999 },
        { id: 's2', agentId: 'a1', cronExpression: '0 9 * * *', nextTriggerAt: 88888 },
      ];
      const db = makeMockDb({
        query: { agentSchedules: { findMany: vi.fn().mockResolvedValue(rows) } },
      });
      const model = createAgentDetailReadModel({ db });
      const result = await model.listAgentSchedules('agent-1');
      expect(result).toHaveLength(2);
      expect(mockToScheduleSummary).toHaveBeenCalledTimes(2);
    });

    it('logs forgeDebug on DB error', async () => {
      const db = makeMockDb({
        query: { agentSchedules: { findMany: vi.fn().mockRejectedValue(new Error('read error')) } },
      });
      const model = createAgentDetailReadModel({ db });
      await expect(model.listAgentSchedules('agent-1')).rejects.toThrow('read error');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('listAgentSchedules'),
        }),
      );
    });
  });

  describe('listAgentNotifications', () => {
    it('returns empty when no notifications exist', async () => {
      const db = makeMockDb();
      const model = createAgentDetailReadModel({ db });
      expect(await model.listAgentNotifications('agent-1')).toEqual([]);
    });

    it('maps notification fields (id, content, createdAt, readAt)', async () => {
      const notifications = [
        { id: 'n1', content: 'Test', createdAt: 1234, readAt: 5678, otherField: 'stripped' },
        { id: 'n2', content: 'Another', createdAt: 2345, readAt: null, otherField: 'stripped' },
      ];
      const db = makeMockDb({
        query: { agentNotifications: { findMany: vi.fn().mockResolvedValue(notifications) } },
      });
      const model = createAgentDetailReadModel({ db });
      const result = await model.listAgentNotifications('agent-1');
      expect(result[0]).toEqual({ id: 'n1', content: 'Test', createdAt: 1234, readAt: 5678 });
      expect(result[1]).toEqual({ id: 'n2', content: 'Another', createdAt: 2345, readAt: null });
    });

    it('passes limit: 50 and desc orderBy to findMany', async () => {
      let captured: Record<string, unknown> = {};
      const db = makeMockDb({
        query: {
          agentNotifications: {
            findMany: vi.fn().mockImplementation((opts: Record<string, unknown>) => {
              captured = opts;
              return [];
            }),
          },
        },
      });
      const model = createAgentDetailReadModel({ db });
      await model.listAgentNotifications('agent-1');
      expect(captured.limit).toBe(50);
      expect(captured.orderBy).toBeDefined();
    });

    it('logs forgeDebug on DB error', async () => {
      const db = makeMockDb({
        query: {
          agentNotifications: { findMany: vi.fn().mockRejectedValue(new Error('read fail')) },
        },
      });
      const model = createAgentDetailReadModel({ db });
      await expect(model.listAgentNotifications('agent-1')).rejects.toThrow('read fail');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('listAgentNotifications'),
        }),
      );
    });
  });

  describe('listAgentMcpServers', () => {
    it('returns empty array when no MCP configs exist', async () => {
      const db = makeMockDb();
      const model = createAgentDetailReadModel({ db });
      expect(await model.listAgentMcpServers('agent-1')).toEqual([]);
    });

    it('merges agentMcpConfigs with mcpServerConfigs', async () => {
      const configs = [
        { id: 'link-1', serverId: 'srv-1', isActive: 1 },
        { id: 'link-2', serverId: 'srv-2', isActive: 0 },
      ];
      const servers = [
        {
          id: 'srv-1',
          name: 'S1',
          description: 'd1',
          transport: 'stdio' as const,
          command: 'node',
          args: '[]',
          envVars: '',
          url: '',
          headers: '',
          createdAt: 111,
          updatedAt: 222,
        },
        {
          id: 'srv-2',
          name: 'S2',
          description: null,
          transport: 'http_streamable' as const,
          command: null,
          args: null,
          envVars: null,
          url: null,
          headers: null,
          createdAt: 333,
          updatedAt: 444,
        },
      ];
      const db = makeMockDb({
        query: {
          agentMcpConfigs: { findMany: vi.fn().mockResolvedValue(configs) },
          mcpServerConfigs: { findMany: vi.fn().mockResolvedValue(servers) },
        },
      });
      const model = createAgentDetailReadModel({ db });
      const result = await model.listAgentMcpServers('agent-1');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        configId: 'link-1',
        serverId: 'srv-1',
        name: 'S1',
        description: 'd1',
        transport: 'stdio',
        command: 'node',
        argsText: '[]',
        envVarsText: '',
        url: '',
        headersText: '',
        isActive: true,
        createdAt: 111,
        updatedAt: 222,
      });
      expect(result[1]).toMatchObject({ configId: 'link-2', serverId: 'srv-2', isActive: false });
    });

    it('skips configs with no matching server', async () => {
      const configs = [{ id: 'link-1', serverId: 'srv-missing', isActive: 1 }];
      const servers = [
        {
          id: 'srv-other',
          name: 'Other',
          description: null,
          transport: 'stdio' as const,
          command: null,
          args: null,
          envVars: null,
          url: null,
          headers: null,
          createdAt: 0,
          updatedAt: 0,
        },
      ];
      const db = makeMockDb({
        query: {
          agentMcpConfigs: { findMany: vi.fn().mockResolvedValue(configs) },
          mcpServerConfigs: { findMany: vi.fn().mockResolvedValue(servers) },
        },
      });
      const model = createAgentDetailReadModel({ db });
      const result = await model.listAgentMcpServers('agent-1');
      expect(result).toHaveLength(1);
      expect(result[0].configId).toBeNull();
    });

    it('logs forgeDebug when mcpConfigs read fails', async () => {
      const db = makeMockDb({
        query: {
          agentMcpConfigs: { findMany: vi.fn().mockRejectedValue(new Error('config fail')) },
        },
      });
      const model = createAgentDetailReadModel({ db });
      await expect(model.listAgentMcpServers('agent-1')).rejects.toThrow('config fail');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('listAgentMcpServers'),
        }),
      );
    });

    it('logs forgeDebug when serverConfigs read fails', async () => {
      const configs = [{ id: 'link-1', serverId: 'srv-1', isActive: 1 }];
      const db = makeMockDb({
        query: {
          agentMcpConfigs: { findMany: vi.fn().mockResolvedValue(configs) },
          mcpServerConfigs: { findMany: vi.fn().mockRejectedValue(new Error('server fail')) },
        },
      });
      const model = createAgentDetailReadModel({ db });
      await expect(model.listAgentMcpServers('agent-1')).rejects.toThrow('server fail');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('listAgentMcpServers'),
        }),
      );
    });
  });

  describe('listAgentLlmProfiles', () => {
    it('returns empty profiles when agent not found', async () => {
      const db = makeMockDb();
      const model = createAgentDetailReadModel({ db });
      expect(await model.listAgentLlmProfiles('ghost')).toEqual({ profiles: [] });
    });

    it('returns empty profiles when agent has no profile IDs', async () => {
      const db = makeMockDb({
        query: {
          agents: {
            findFirst: vi.fn().mockResolvedValue({ modelProfileId: null, omModelProfileId: null }),
          },
        },
      });
      const model = createAgentDetailReadModel({ db });
      expect(await model.listAgentLlmProfiles('agent-1')).toEqual({ profiles: [] });
    });

    it('returns profiles when agent has profile IDs', async () => {
      const profiles = [
        { id: 'prof-1', name: 'GPT-4' },
        { id: 'prof-2', name: 'Claude' },
      ];
      const db = makeMockDb({
        query: {
          agents: {
            findFirst: vi
              .fn()
              .mockResolvedValue({ modelProfileId: 'prof-1', omModelProfileId: 'prof-2' }),
          },
          llmProfiles: { findMany: vi.fn().mockResolvedValue(profiles) },
        },
      });
      const model = createAgentDetailReadModel({ db });
      expect(await model.listAgentLlmProfiles('agent-1')).toEqual({ profiles });
    });

    it('logs forgeDebug on agent read error', async () => {
      const db = makeMockDb({
        query: { agents: { findFirst: vi.fn().mockRejectedValue(new Error('agent read fail')) } },
      });
      const model = createAgentDetailReadModel({ db });
      await expect(model.listAgentLlmProfiles('agent-1')).rejects.toThrow('agent read fail');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('listAgentLlmProfiles'),
        }),
      );
    });

    it('logs forgeDebug on profiles read error', async () => {
      const db = makeMockDb({
        query: {
          agents: {
            findFirst: vi
              .fn()
              .mockResolvedValue({ modelProfileId: 'prof-1', omModelProfileId: null }),
          },
          llmProfiles: { findMany: vi.fn().mockRejectedValue(new Error('profile fail')) },
        },
      });
      const model = createAgentDetailReadModel({ db });
      await expect(model.listAgentLlmProfiles('agent-1')).rejects.toThrow('profile fail');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('listAgentLlmProfiles'),
        }),
      );
    });
  });
});
