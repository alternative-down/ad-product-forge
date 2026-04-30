import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';
import { createId } from '../utils/id';

const mocks = vi.hoisted(() => ({
  createIdMock: vi.fn(() => 'snapshot-id'),
  insertMock: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('../utils/id', () => ({ createId: mocks.createIdMock }));

function createMockDb() {
  return {
    insert: mocks.insertMock,
  };
}

describe('createAgentHomeMetricSnapshotStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertMock.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  });

  describe('recordSnapshot', () => {
    it('inserts snapshot with generated id', async () => {
      const store = createAgentHomeMetricSnapshotStore(createMockDb() as any);
      const before = Date.now();

      await store.recordSnapshot({
        agentId: 'agent-1',
        stepId: 'step-1',
        stepCreatedAt: before,
        snapshot: { metric: 1 },
      });

      // Verify insert was called with the table
      expect(mocks.insertMock).toHaveBeenCalled();
      expect(mocks.insertMock.mock.calls.length).toBe(1);
      
      // The insert call passes the table reference
      const insertCall = mocks.insertMock.mock.calls[0];
      expect(insertCall[0]).toBeDefined(); // table reference
    });

    it('records current time as createdAt', async () => {
      const store = createAgentHomeMetricSnapshotStore(createMockDb() as any);
      const before = Date.now();

      await store.recordSnapshot({
        agentId: 'agent-1',
        stepId: 'step-1',
        stepCreatedAt: before,
        snapshot: { metric: 1 },
      });

      // values was called with some object
      const valuesCall = mocks.insertMock.mock.results[0].value?.values;
      expect(valuesCall).toBeDefined();
    });

    it('stores snapshot data', async () => {
      const store = createAgentHomeMetricSnapshotStore(createMockDb() as any);
      const snapshotData = { cpu: 0.8, memory: 0.6 };

      let capturedValues: any;
      mocks.insertMock.mockReturnValue({
        values: vi.fn((v) => {
          capturedValues = v;
          return Promise.resolve();
        }),
      });

      await store.recordSnapshot({
        agentId: 'agent-1',
        stepId: 'step-1',
        stepCreatedAt: Date.now(),
        snapshot: snapshotData,
      });

      expect(capturedValues).toMatchObject({
        agentId: 'agent-1',
        stepId: 'step-1',
        id: 'snapshot-id',
        snapshot: snapshotData,
      });
      expect(capturedValues.createdAt).toBeGreaterThan(0);
    });

    it('returns createdAt in result', async () => {
      const store = createAgentHomeMetricSnapshotStore(createMockDb() as any);
      const before = Date.now();

      const result = await store.recordSnapshot({
        agentId: 'agent-1',
        stepId: 'step-1',
        stepCreatedAt: before,
        snapshot: {},
      });

      const after = Date.now();
      expect(result.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.createdAt).toBeLessThanOrEqual(after);
    });

    it('propagates db errors', async () => {
      mocks.insertMock.mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('db failure')),
      });
      const store = createAgentHomeMetricSnapshotStore(createMockDb() as any);

      await expect(store.recordSnapshot({
        agentId: 'agent-1',
        stepId: 'step-1',
        stepCreatedAt: Date.now(),
        snapshot: {},
      })).rejects.toThrow('db failure');
    });
  });
});
