/**
 * Unit tests for agents/agent-home-metric-snapshot-store.ts.
 * Tests recordSnapshot against a mocked DB.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../database/client';

import { createAgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';

// ─── Mock factory ────────────────────────────────────────────────────────────
// drizzle-orm insert returns a chain: .insert(table).values(...) → Promise

type CapturedValues = {
  id: string;
  agentId: string;
  stepId: string;
  stepCreatedAt: number;
  snapshot: unknown;
  createdAt: number;
};

function makeMockDb(overrides: { insertError?: Error } = {}) {
  const captured: CapturedValues[] = [];

  function capture(values: Record<string, unknown>) {
    captured.push(values as unknown as CapturedValues);
    if (overrides.insertError) throw overrides.insertError;
  }

  const mockInsert = vi.fn(() => ({
    values: vi.fn((vals: Record<string, unknown>) => {
      capture(vals);
      return Promise.resolve();
    }),
  }));

  return { mockInsert, captured };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createAgentHomeMetricSnapshotStore', () => {
  describe('recordSnapshot', () => {
    it('calls db.insert exactly once', async () => {
      const { mockInsert } = makeMockDb();
      const db = { insert: mockInsert, query: {} } as unknown as Database;
      const store = createAgentHomeMetricSnapshotStore(db);

      await store.recordSnapshot({
        agentId: 'agent-42',
        stepId: 'step-1',
        stepCreatedAt: Date.now(),
        snapshot: { metric: 0.5 },
      });

      expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it('captures agentId and stepId in insert values', async () => {
      const { mockInsert, captured } = makeMockDb();
      const db = { insert: mockInsert, query: {} } as unknown as Database;
      const store = createAgentHomeMetricSnapshotStore(db);

      await store.recordSnapshot({
        agentId: 'agent-abc',
        stepId: 'step-xyz',
        stepCreatedAt: 1_000_000,
        snapshot: { score: 0.9 },
      });

      expect(captured[0].agentId).toBe('agent-abc');
      expect(captured[0].stepId).toBe('step-xyz');
    });

    it('captures the snapshot object as-is', async () => {
      const { mockInsert, captured } = makeMockDb();
      const db = { insert: mockInsert, query: {} } as unknown as Database;
      const store = createAgentHomeMetricSnapshotStore(db);
      const snapshotData = { metrics: { cpu: 0.3, memory: 0.7 } };

      await store.recordSnapshot({
        agentId: 'agent-42',
        stepId: 'step-1',
        stepCreatedAt: Date.now(),
        snapshot: snapshotData,
      });

      expect(captured[0].snapshot).toBe(snapshotData);
    });

    it('captures stepCreatedAt', async () => {
      const { mockInsert, captured } = makeMockDb();
      const db = { insert: mockInsert, query: {} } as unknown as Database;
      const store = createAgentHomeMetricSnapshotStore(db);
      const stepCreatedAt = Date.now() - 60_000;

      await store.recordSnapshot({
        agentId: 'agent-42',
        stepId: 'step-1',
        stepCreatedAt,
        snapshot: {},
      });

      expect(captured[0].stepCreatedAt).toBe(stepCreatedAt);
    });

    it('captured createdAt is a positive number', async () => {
      const { mockInsert, captured } = makeMockDb();
      const db = { insert: mockInsert, query: {} } as unknown as Database;
      const store = createAgentHomeMetricSnapshotStore(db);
      const before = Date.now();

      await store.recordSnapshot({
        agentId: 'agent-42',
        stepId: 'step-1',
        stepCreatedAt: Date.now(),
        snapshot: {},
      });

      expect(typeof captured[0].createdAt).toBe('number');
      expect(captured[0].createdAt).toBeGreaterThanOrEqual(before);
    });

    it('returns an object with createdAt property', async () => {
      const { mockInsert } = makeMockDb();
      const db = { insert: mockInsert, query: {} } as unknown as Database;
      const store = createAgentHomeMetricSnapshotStore(db);

      const result = await store.recordSnapshot({
        agentId: 'agent-42',
        stepId: 'step-1',
        stepCreatedAt: Date.now(),
        snapshot: {},
      });

      expect(result).toHaveProperty('createdAt');
      expect(typeof result.createdAt).toBe('number');
    });

    it('re-throws when db insert fails', async () => {
      const db = { insert: vi.fn(() => ({ values: vi.fn(() => Promise.reject(new Error('DB write failed'))) })), query: {} } as unknown as Database;
      const store = createAgentHomeMetricSnapshotStore(db);

      await expect(store.recordSnapshot({
        agentId: 'agent-42',
        stepId: 'step-1',
        stepCreatedAt: Date.now(),
        snapshot: {},
      })).rejects.toThrow('DB write failed');
    });

    it('works with empty snapshot object', async () => {
      const { mockInsert } = makeMockDb();
      const db = { insert: mockInsert, query: {} } as unknown as Database;
      const store = createAgentHomeMetricSnapshotStore(db);

      const result = await store.recordSnapshot({
        agentId: 'agent-42',
        stepId: 'step-1',
        stepCreatedAt: Date.now(),
        snapshot: {},
      });

      expect(result).toHaveProperty('createdAt');
    });

    it('works with null snapshot', async () => {
      const { mockInsert, captured } = makeMockDb();
      const db = { insert: mockInsert, query: {} } as unknown as Database;
      const store = createAgentHomeMetricSnapshotStore(db);

      await store.recordSnapshot({
        agentId: 'agent-42',
        stepId: 'step-1',
        stepCreatedAt: Date.now(),
        snapshot: null as unknown,
      });

      expect(captured[0].snapshot).toBeNull();
    });
  });

  describe('store shape', () => {
    it('exposes recordSnapshot as a function', () => {
      const { mockInsert } = makeMockDb();
      const db = { insert: mockInsert, query: {} } as unknown as Database;
      const store = createAgentHomeMetricSnapshotStore(db);

      expect(typeof store.recordSnapshot).toBe('function');
    });
  });
});
