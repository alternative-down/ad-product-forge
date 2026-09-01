import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildSystemHealthcheck,
  classifyHealth,
  type HealthcheckRegistry,
  type HealthcheckReadModel,
} from './healthcheck';

describe('buildSystemHealthcheck', () => {
  it('returns agents list and timestamp from registry and readModel', async () => {
    const now = 1700000060000;
    const mockRegistry = {
      list: vi.fn().mockReturnValue([
        {
          id: 'agent-abc',
        },
      ]),
      get: vi.fn().mockResolvedValue({
        meta: { name: 'Test Agent' },
      }),
    } as unknown as HealthcheckRegistry;

    const mockReadModel = {
      getAgent: vi.fn().mockResolvedValue({
        id: 'agent-abc',
        status: 'running',
        roleId: 'admin',
        lastHeartbeat: 1700000000000,
      }),
    } as unknown as HealthcheckReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel, now);

    expect(result.timestamp).toBe(now);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]).toEqual({
      agentId: 'agent-abc',
      agentName: 'Test Agent',
      status: 'running',
      role: 'admin',
      lastHeartbeat: 1700000000000,
      health: 'healthy',
      secondsSinceLastHeartbeat: 60,
    });
  });

  it('uses agentId as fallback name when meta.name is missing', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([{ id: 'agent-xyz' }]),
      get: vi.fn().mockResolvedValue({ meta: {} }),
    } as unknown as HealthcheckRegistry;

    const mockReadModel = {
      getAgent: vi.fn().mockResolvedValue({ id: 'agent-xyz', status: 'idle' }),
    } as unknown as HealthcheckReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents[0].agentName).toBe('agent-xyz');
  });

  it('returns unknown status when agent not in readModel', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([{ id: 'agent-unknown' }]),
      get: vi.fn().mockResolvedValue({ meta: { name: 'Ghost' } }),
    } as unknown as HealthcheckRegistry;

    const mockReadModel = {
      getAgent: vi.fn().mockResolvedValue(null),
    } as unknown as HealthcheckReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents[0].status).toBe('unknown');
    expect(result.agents[0].role).toBeNull();
    expect(result.agents[0].lastHeartbeat).toBeNull();
    expect(result.agents[0].health).toBe('unknown');
    expect(result.agents[0].secondsSinceLastHeartbeat).toBeNull();
  });

  it('returns empty agents list when registry is empty', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([]),
      get: vi.fn(),
    } as unknown as HealthcheckRegistry;

    const mockReadModel = {} as unknown as HealthcheckReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents).toHaveLength(0);
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('handles multiple agents in registry', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([{ id: 'agent-1' }, { id: 'agent-2' }, { id: 'agent-3' }]),
      get: vi
        .fn()
        .mockResolvedValueOnce({ meta: { name: 'Alice' } })
        .mockResolvedValueOnce({ meta: {} })
        .mockResolvedValueOnce({ meta: { name: 'Bob' } }),
    } as unknown as HealthcheckRegistry;

    const mockReadModel = {
      getAgent: vi
        .fn()
        .mockResolvedValueOnce({ id: 'agent-1', status: 'running' })
        .mockResolvedValueOnce({ id: 'agent-2', status: 'idle' })
        .mockResolvedValueOnce({ id: 'agent-3', status: 'running' }),
    } as unknown as HealthcheckReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents).toHaveLength(3);
    expect(result.agents[0].agentName).toBe('Alice');
    expect(result.agents[1].agentName).toBe('agent-2');
    expect(result.agents[2].agentName).toBe('Bob');
  });

  it('handles agent without roleId in readModel', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([{ id: 'agent-x' }]),
      get: vi.fn().mockResolvedValue({ meta: { name: 'X' } }),
    } as unknown as HealthcheckRegistry;

    const mockReadModel = {
      getAgent: vi.fn().mockResolvedValue({ id: 'agent-x', status: 'running' }),
    } as unknown as HealthcheckReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents[0].role).toBeNull();
  });

  it('handles lastHeartbeat missing in readModel', async () => {
    const mockRegistry = {
      list: vi.fn().mockReturnValue([{ id: 'agent-y' }]),
      get: vi.fn().mockResolvedValue({ meta: { name: 'Y' } }),
    } as unknown as HealthcheckRegistry;

    const mockReadModel = {
      getAgent: vi.fn().mockResolvedValue({ id: 'agent-y', status: 'idle' }),
    } as unknown as HealthcheckReadModel;

    const result = await buildSystemHealthcheck(mockRegistry, mockReadModel);

    expect(result.agents[0].lastHeartbeat).toBeNull();
    expect(result.agents[0].health).toBe('unknown');
    expect(result.agents[0].secondsSinceLastHeartbeat).toBeNull();
  });
});

describe('classifyHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('classifies agent as healthy when lastHeartbeat is less than 5min old', () => {
    const now = Date.now();
    const fourMinAgo = now - 4 * 60 * 1000;
    const result = classifyHealth(fourMinAgo, now);
    expect(result.health).toBe('healthy');
    expect(result.secondsSinceLastHeartbeat).toBe(240);
  });

  it('classifies agent as stale when lastHeartbeat is 5-30min old', () => {
    const now = Date.now();
    const tenMinAgo = now - 10 * 60 * 1000;
    const result = classifyHealth(tenMinAgo, now);
    expect(result.health).toBe('stale');
    expect(result.secondsSinceLastHeartbeat).toBe(600);
  });

  it('classifies agent as dead when lastHeartbeat is more than 30min old', () => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const result = classifyHealth(oneHourAgo, now);
    expect(result.health).toBe('dead');
    expect(result.secondsSinceLastHeartbeat).toBe(3600);
  });

  it('classifies agent as unknown when lastHeartbeat is null', () => {
    const now = Date.now();
    const result = classifyHealth(null, now);
    expect(result.health).toBe('unknown');
    expect(result.secondsSinceLastHeartbeat).toBeNull();
  });
});
