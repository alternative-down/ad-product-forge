import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAgentMetricsReadModel } from './agents-metrics';

function makeMockDb(findManyFn: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([])) {
  return {
    query: {
      agentHomeMetricSnapshots: {
        findMany: findManyFn,
      },
    },
  } as unknown as Parameters<typeof createAgentMetricsReadModel>[0]['db'];
}

describe('createAgentMetricsReadModel', () => {
  beforeEach(() => {});

  describe('listRecentAgentHomeMetricSnapshots', () => {
    it('returns empty array when no snapshots exist', async () => {
      const db = makeMockDb();
      const model = createAgentMetricsReadModel({ db });
      const result = await model.listRecentAgentHomeMetricSnapshots({ agentId: 'agent-1', limit: 10 });
      expect(result).toEqual([]);
    });

    it('passes agentId filter and limit to findMany', async () => {
      let captured: Record<string, unknown> = {};
      const findMany = vi.fn().mockImplementation((opts: Record<string, unknown>) => {
        captured = opts;
        return [];
      });
      const db = makeMockDb(findMany);
      const model = createAgentMetricsReadModel({ db });
      await model.listRecentAgentHomeMetricSnapshots({ agentId: 'agent-42', limit: 5 });
      expect(captured['where']).toBeDefined();
      expect(captured['limit']).toBe(5);
    });

    it('orders by createdAt desc', async () => {
      let captured: Record<string, unknown> = {};
      const findMany = vi.fn().mockImplementation((opts: Record<string, unknown>) => {
        captured = opts;
        return [];
      });
      const db = makeMockDb(findMany);
      const model = createAgentMetricsReadModel({ db });
      await model.listRecentAgentHomeMetricSnapshots({ agentId: 'agent-1', limit: 20 });
      expect(captured['orderBy']).toBeDefined();
    });

    it('maps id to snapshotId and strips id from each row', async () => {
      const rows = [
        { id: 1, agentId: 'a1', snapshotType: 'cpu', snapshotData: { cpu: 0.5 }, createdAt: new Date() },
        { id: 2, agentId: 'a1', snapshotType: 'memory', snapshotData: { memory: 0.3 }, createdAt: new Date() },
      ];
      const db = makeMockDb(vi.fn().mockResolvedValue(rows));
      const model = createAgentMetricsReadModel({ db });
      const result = await model.listRecentAgentHomeMetricSnapshots({ agentId: 'a1', limit: 10 });
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('snapshotId', 1);
      expect(result[0]).not.toHaveProperty('id');
      expect(result[1]).toHaveProperty('snapshotId', 2);
      expect(result[1]).not.toHaveProperty('id');
    });

    it('preserves snapshotType, snapshotData, agentId, createdAt in mapped rows', async () => {
      const createdAt = new Date('2026-01-01');
      const rows = [
        { id: 5, agentId: 'my-agent', snapshotType: 'tasks', snapshotData: { pending: 3 }, createdAt },
      ];
      const db = makeMockDb(vi.fn().mockResolvedValue(rows));
      const model = createAgentMetricsReadModel({ db });
      const result = await model.listRecentAgentHomeMetricSnapshots({ agentId: 'my-agent', limit: 10 });
      expect(result[0]).toEqual({
        agentId: 'my-agent',
        snapshotType: 'tasks',
        snapshotData: { pending: 3 },
        createdAt,
        snapshotId: 5,
      });
    });

    it('propagates DB error as-is', async () => {
      const db = makeMockDb(vi.fn().mockRejectedValue(new Error('snapshot read failed')));
      const model = createAgentMetricsReadModel({ db });
      await expect(model.listRecentAgentHomeMetricSnapshots({ agentId: 'agent-1', limit: 10 }))
        .rejects.toThrow('snapshot read failed');
    });
  });
});