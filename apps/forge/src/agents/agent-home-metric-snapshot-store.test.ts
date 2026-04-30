import { describe, expect, it, vi } from 'vitest';

// Test the pure logic parts of the snapshot store.
// The store's core logic is: call createId(), capture Date.now(), call db.insert(...).
// We test via a mock that captures every call so we can verify field correctness.

function createMockDb() {
  const calls: any[] = [];
  const insert = vi.fn((table) => {
    return {
      values: (v: any) => {
        calls.push({ table, values: v });
        return Promise.resolve();
      },
    };
  });
  return { insert, calls };
}

describe('createAgentHomeMetricSnapshotStore', () => {
  it('calls insert once per recordSnapshot', async () => {
    // Inline the store creation with a mock to test behavior
    const { createAgentHomeMetricSnapshotStore } = await import('./agent-home-metric-snapshot-store');
    const mockDb = createMockDb();
    const store = createAgentHomeMetricSnapshotStore(mockDb as any);

    await store.recordSnapshot({
      agentId: 'agent-1',
      stepId: 'step-1',
      stepCreatedAt: 1700000000000,
      snapshot: { key: 'val' },
    });

    expect(mockDb.calls.length).toBe(1);
    const call = mockDb.calls[0];
    expect(call.values.agentId).toBe('agent-1');
    expect(call.values.stepId).toBe('step-1');
    expect(call.values.stepCreatedAt).toBe(1700000000000);
    expect(call.values.snapshot).toEqual({ key: 'val' });
    expect(typeof call.values.id).toBe('string');
    expect(typeof call.values.createdAt).toBe('number');
  });

  it('returns createdAt as a number', async () => {
    const { createAgentHomeMetricSnapshotStore } = await import('./agent-home-metric-snapshot-store');
    const mockDb = createMockDb();
    const store = createAgentHomeMetricSnapshotStore(mockDb as any);

    const before = Date.now();
    const result = await store.recordSnapshot({
      agentId: 'a',
      stepId: 's',
      stepCreatedAt: 0,
      snapshot: {},
    });
    const after = Date.now();

    expect(result.createdAt).toBeGreaterThanOrEqual(before);
    expect(result.createdAt).toBeLessThanOrEqual(after);
  });

  it('assigns unique ids to each snapshot', async () => {
    const { createAgentHomeMetricSnapshotStore } = await import('./agent-home-metric-snapshot-store');
    const mockDb = createMockDb();
    const store = createAgentHomeMetricSnapshotStore(mockDb as any);

    await store.recordSnapshot({ agentId: 'a', stepId: 's1', stepCreatedAt: 0, snapshot: {} });
    await store.recordSnapshot({ agentId: 'a', stepId: 's2', stepCreatedAt: 0, snapshot: {} });

    expect(mockDb.calls[0].values.id).not.toBe(mockDb.calls[1].values.id);
  });

  it('accepts complex nested snapshot', async () => {
    const { createAgentHomeMetricSnapshotStore } = await import('./agent-home-metric-snapshot-store');
    const mockDb = createMockDb();
    const store = createAgentHomeMetricSnapshotStore(mockDb as any);

    const snapshot = { metrics: { cpu: 0.9 }, steps: [{ id: 'x' }], tags: null };
    await store.recordSnapshot({ agentId: 'a', stepId: 's', stepCreatedAt: 0, snapshot });

    expect(mockDb.calls[0].values.snapshot).toEqual(snapshot);
  });

  it('handles empty string stepId', async () => {
    const { createAgentHomeMetricSnapshotStore } = await import('./agent-home-metric-snapshot-store');
    const mockDb = createMockDb();
    const store = createAgentHomeMetricSnapshotStore(mockDb as any);

    await store.recordSnapshot({ agentId: 'a', stepId: '', stepCreatedAt: 0, snapshot: {} });
    expect(mockDb.calls[0].values.stepId).toBe('');
  });

  it('handles large timestamp', async () => {
    const { createAgentHomeMetricSnapshotStore } = await import('./agent-home-metric-snapshot-store');
    const mockDb = createMockDb();
    const store = createAgentHomeMetricSnapshotStore(mockDb as any);

    await store.recordSnapshot({ agentId: 'a', stepId: 's', stepCreatedAt: Number.MAX_SAFE_INTEGER, snapshot: {} });
    expect(mockDb.calls[0].values.stepCreatedAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('handles zero timestamp', async () => {
    const { createAgentHomeMetricSnapshotStore } = await import('./agent-home-metric-snapshot-store');
    const mockDb = createMockDb();
    const store = createAgentHomeMetricSnapshotStore(mockDb as any);

    await store.recordSnapshot({ agentId: 'a', stepId: 's', stepCreatedAt: 0, snapshot: {} });
    expect(mockDb.calls[0].values.stepCreatedAt).toBe(0);
  });

  it('handles snapshot with special JS values', async () => {
    const { createAgentHomeMetricSnapshotStore } = await import('./agent-home-metric-snapshot-store');
    const mockDb = createMockDb();
    const store = createAgentHomeMetricSnapshotStore(mockDb as any);

    const snapshot = { bool: false, zero: 0, empty: '', nil: null, nan: NaN };
    await store.recordSnapshot({ agentId: 'a', stepId: 's', stepCreatedAt: 0, snapshot });

    expect(mockDb.calls[0].values.snapshot).toEqual(snapshot);
  });
});
