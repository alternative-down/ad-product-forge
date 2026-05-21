import { describe, expect, it, vi } from 'vitest';
type InternalAgentRegistry = {
  listAgents: () => Promise<Array<{ agentId: string; name: string; status: string }>>;
};
type AdminReadModel = {
  agents: { listAgents: () => Promise<unknown> };
  finance: { getFinance: () => Promise<unknown> };
};
import { buildSystemHealthcheck } from './healthcheck';

describe('buildSystemHealthcheck', () => {
  it('returns agents list and timestamp from registry and readModel', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([
        {
          runtime: { id: 'agent-abc' },
        },
      ]),
      get: vi.fn().mockResolvedValue({
        meta: { name: 'Test Agent' },
      }),
    } as unknown as InternalAgentRegistry;

    const mockReadModel = {
      getAgent: vi.fn().mockResolvedValue({
        id: 'agent-abc',
        status: 'running',
        roleId: 'admin',
        lastHeartbeat: 1700000000000,
      }),
    } as unknown as AdminReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]).toEqual({
      agentId: 'agent-abc',
      agentName: 'Test Agent',
      status: 'running',
      role: 'admin',
      lastHeartbeat: 1700000000000,
    });
  });

  it('uses agentId as fallback name when meta.name is missing', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([{ runtime: { id: 'agent-xyz' } }]),
      get: vi.fn().mockResolvedValue({ meta: {} }),
    } as unknown as InternalAgentRegistry;

    const mockReadModel = {
      getAgent: vi.fn().mockResolvedValue({ id: 'agent-xyz', status: 'idle' }),
    } as unknown as AdminReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents[0].agentName).toBe('agent-xyz');
  });

  it('returns unknown status when agent not in readModel', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([{ runtime: { id: 'agent-unknown' } }]),
      get: vi.fn().mockResolvedValue({ meta: { name: 'Ghost' } }),
    } as unknown as InternalAgentRegistry;

    const mockReadModel = {
      getAgent: vi.fn().mockResolvedValue(null),
    } as unknown as AdminReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents[0].status).toBe('unknown');
    expect(result.agents[0].role).toBeNull();
    expect(result.agents[0].lastHeartbeat).toBeNull();
  });

  it('returns empty agents list when registry is empty', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([]),
      get: vi.fn(),
    } as unknown as InternalAgentRegistry;

    const mockReadModel = {} as AdminReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents).toHaveLength(0);
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('handles multiple agents in registry', async () => {
    const mockRegistry = {
      list: vi
        .fn()
        .mockReturnValue([
          { runtime: { id: 'agent-1' } },
          { runtime: { id: 'agent-2' } },
          { runtime: { id: 'agent-3' } },
        ]),
      get: vi
        .fn()
        .mockResolvedValueOnce({ meta: { name: 'Alice' } })
        .mockResolvedValueOnce({ meta: {} })
        .mockResolvedValueOnce({ meta: { name: 'Bob' } }),
    } as unknown as InternalAgentRegistry;

    const mockReadModel = {
      getAgent: vi
        .fn()
        .mockResolvedValueOnce({ id: 'agent-1', status: 'running' })
        .mockResolvedValueOnce({ id: 'agent-2', status: 'idle' })
        .mockResolvedValueOnce({ id: 'agent-3', status: 'running' }),
    } as unknown as AdminReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents).toHaveLength(3);
    expect(result.agents[0].agentName).toBe('Alice');
    expect(result.agents[1].agentName).toBe('agent-2');
    expect(result.agents[2].agentName).toBe('Bob');
  });

  it('handles agent without roleId in readModel', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([{ runtime: { id: 'agent-no-role' } }]),
      get: vi.fn().mockResolvedValue({ meta: { name: 'Roleless' } }),
    } as unknown as InternalAgentRegistry;

    const mockReadModel = {
      getAgent: vi.fn().mockResolvedValue({
        id: 'agent-no-role',
        status: 'running',
        lastHeartbeat: 1700000000000,
      }),
    } as unknown as AdminReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents[0].role).toBeNull();
  });

  it('handles lastHeartbeat missing in readModel', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([{ runtime: { id: 'agent-no-heartbeat' } }]),
      get: vi.fn().mockResolvedValue({ meta: { name: 'Silent' } }),
    } as unknown as InternalAgentRegistry;

    const mockReadModel = {
      getAgent: vi.fn().mockResolvedValue({
        id: 'agent-no-heartbeat',
        status: 'idle',
      }),
    } as unknown as AdminReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents[0].lastHeartbeat).toBeNull();
  });
});
