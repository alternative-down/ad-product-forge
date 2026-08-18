/**
 * Tests for createManagerQueries — issue #6523 coverage gap.
 *
 * Public surface (per queries.ts header):
 *   - isActiveSchedule (top-level export, also bound as ManagerQueries.isActiveSchedule)
 *   - getAgentSchedule
 *   - loadAll
 *   - listSchedules
 *   - listTasks
 *
 * Pattern source: __isActiveSchedule-db-coverage.test.ts (sibling file).
 *
 * The store and lifecycle are mocked at the import boundary (not internal
 * function substitution). No typed Error subclasses are thrown by queries.ts
 * — error paths re-throw after debug-logging, so this file does NOT
 * validate Pattern L (#6522) subclasses (those are exercised in
 * mutations.test.ts / lifecycle.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createManagerQueries, isActiveSchedule } from './queries';
import type {
  CreateManagerQueriesInput,
  ManagerQueries,
} from './queries';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const baseSchedule = {
  scheduleId: 'sched-1',
  agentId: 'agent-1',
  kind: 'agent' as const,
  name: 'test-schedule',
  description: 'Test schedule',
  scheduleType: 'date' as const,
  cronExpression: null,
  scheduledDate: Date.now() + 60_000,
  timezone: 'UTC',
  content: 'test content',
  wakeWhenRunning: false,
  isActive: 1 as const,
  creatorId: 'creator-1',
  createdAt: 1000,
  updatedAt: 1000,
  lastTriggeredAt: null,
  nextTriggerAt: null,
};

function makeStore(overrides: Partial<CreateManagerQueriesInput['store']> = {}) {
  return {
    getAgentSchedule: vi.fn().mockResolvedValue(baseSchedule),
    listAgentSchedules: vi.fn().mockResolvedValue([baseSchedule]),
    listCreatedAgentSchedules: vi.fn().mockResolvedValue([baseSchedule]),
    ...overrides,
  };
}

function makeLifecycle(overrides: Partial<{
  loadAll: () => Promise<void>;
  stop: () => Promise<void>;
  register: (record: unknown) => Promise<void>;
  cancel: (scheduleId: string) => void;
}> = {}) {
  return {
    loadAll: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    ...overrides,
  };
}

let queries: ManagerQueries;

beforeEach(() => {
  queries = createManagerQueries({
    store: makeStore(),
    getLifecycle: () => makeLifecycle(),
  });
});

// ─── isActiveSchedule (top-level) ────────────────────────────────────────────

describe('isActiveSchedule (top-level export)', () => {
  it('returns true for boolean true', () => {
    expect(isActiveSchedule({ isActive: true })).toBe(true);
  });

  it('returns true for DB integer 1', () => {
    // Lead 8 #5739 Phase 2 fix: accept DB-stored 0|1 integers
    expect(isActiveSchedule({ isActive: 1 })).toBe(true);
  });

  it('returns false for boolean false', () => {
    expect(isActiveSchedule({ isActive: false })).toBe(false);
  });

  it('returns false for DB integer 0', () => {
    expect(isActiveSchedule({ isActive: 0 })).toBe(false);
  });
});

// ─── getAgentSchedule ────────────────────────────────────────────────────────

describe('getAgentSchedule', () => {
  it('returns the stored schedule on success', async () => {
    const result = await queries.getAgentSchedule('agent-1', 'sched-1');
    expect(result).toEqual(baseSchedule);
  });

  it('returns null when the store returns null (not found)', async () => {
    queries = createManagerQueries({
      store: makeStore({ getAgentSchedule: vi.fn().mockResolvedValue(null) }),
      getLifecycle: () => null,
    });
    const result = await queries.getAgentSchedule('agent-1', 'missing');
    expect(result).toBeNull();
  });

  it('re-throws when the store throws (after debug logging)', async () => {
    const storeError = new Error('db connection lost');
    queries = createManagerQueries({
      store: makeStore({ getAgentSchedule: vi.fn().mockRejectedValue(storeError) }),
      getLifecycle: () => null,
    });
    await expect(queries.getAgentSchedule('agent-1', 'sched-1')).rejects.toBe(storeError);
  });
});

// ─── loadAll ──────────────────────────────────────────────────────────────────

describe('loadAll', () => {
  it('calls lifecycle.loadAll() when lifecycle is present', async () => {
    const lifecycle = makeLifecycle();
    queries = createManagerQueries({
      store: makeStore(),
      getLifecycle: () => lifecycle,
    });
    await queries.loadAll();
    expect(lifecycle.loadAll).toHaveBeenCalledOnce();
  });

  it('no-ops when lifecycle is null', async () => {
    const lifecycle = makeLifecycle();
    queries = createManagerQueries({
      store: makeStore(),
      getLifecycle: () => null,
    });
    await queries.loadAll();
    expect(lifecycle.loadAll).not.toHaveBeenCalled();
  });
});

// ─── listSchedules ───────────────────────────────────────────────────────────

describe('listSchedules', () => {
  it('returns tool-output-shaped array for the agent', async () => {
    const result = await queries.listSchedules('agent-1');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    // toToolOutput strips internal fields, keeps scheduleId/name/etc.
    expect(result[0]).toMatchObject({
      scheduleId: 'sched-1',
      name: 'test-schedule',
      scheduleType: 'date',
    });
  });

  it('returns empty array when the agent has no schedules', async () => {
    queries = createManagerQueries({
      store: makeStore({ listAgentSchedules: vi.fn().mockResolvedValue([]) }),
      getLifecycle: () => null,
    });
    const result = await queries.listSchedules('agent-99');
    expect(result).toEqual([]);
  });

  it('re-throws when the store throws', async () => {
    const storeError = new Error('query failed');
    queries = createManagerQueries({
      store: makeStore({ listAgentSchedules: vi.fn().mockRejectedValue(storeError) }),
      getLifecycle: () => null,
    });
    await expect(queries.listSchedules('agent-1')).rejects.toBe(storeError);
  });
});

// ─── listTasks ───────────────────────────────────────────────────────────────

describe('listTasks', () => {
  it('returns tasks with createdBy + targetAgentId + taskId for a creator', async () => {
    const result = await queries.listTasks('creator-1', 'agent-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      createdBy: 'creator-1',
      targetAgentId: 'agent-1',
      taskId: 'sched-1',
      scheduleId: 'sched-1',
    });
  });

  it('returns tasks without targetAgentId filter', async () => {
    const result = await queries.listTasks('creator-1');
    expect(result).toHaveLength(1);
    expect(result[0]?.createdBy).toBe('creator-1');
  });

  it('re-throws when the store throws', async () => {
    const storeError = new Error('creator query failed');
    queries = createManagerQueries({
      store: makeStore({ listCreatedAgentSchedules: vi.fn().mockRejectedValue(storeError) }),
      getLifecycle: () => null,
    });
    await expect(queries.listTasks('creator-1')).rejects.toBe(storeError);
  });
});
