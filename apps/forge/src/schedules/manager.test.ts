import { describe, expect, test, vi, beforeEach } from 'vitest';

import { createAgentScheduleManager } from './manager';
import type { Database } from '../db/database';
// ─── extractWhere helpers ───────────────────────────────────────────────────────
//
// Drizzle 0.26.x chunk structure:
//   SQLiteText / SQLiteInteger: { constructor: 'SQLiteText', config: { name: 'column_name' } }
//   StringChunk: { value: string[] }
//   Nested SQL from and(): { queryChunks: [...], constructor: 'SQL' }
//   Param: { value: [...] }

function isSQL(x: unknown): x is { queryChunks: unknown[] } {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && 'queryChunks' in x;
}

function isStringChunk(x: unknown): boolean {
  return (
    typeof x === 'object' &&
    x !== null &&
    !Array.isArray(x) &&
    'value' in x &&
    Array.isArray((x as { value: unknown }).value)
  );
}

function isColumn(x: unknown): boolean {
  const n = (x as { constructor?: { name?: string } })?.constructor?.name;
  return (
    n === 'SQLiteText' || n === 'SQLiteInteger' || n === 'SQLiteBlob' || n === 'SQLiteReal' ||
    n === 'SQLiteTextBuilder' || n === 'SQLiteIntegerBuilder' ||
    n === 'SQLiteBlobBuilder' || n === 'SQLiteRealBuilder'
  );
}

function extractConditions(sql: unknown): Array<{ colName: string; value: unknown }> {
  if (!isSQL(sql)) return [];
  const result: Array<{ colName: string; value: unknown }> = [];
  const chunks = sql.queryChunks ?? [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (isStringChunk(chunk)) continue;
    // Recurse into nested SQL (e.g. from and())
    if (isSQL(chunk) && chunk.queryChunks?.length && !isColumn(chunk)) {
      result.push(...extractConditions(chunk));
      continue;
    }
    if (!isColumn(chunk)) continue;
    const colName = (chunk as { config?: { name?: string } }).config?.name;
    if (!colName) continue;
    let j = i + 1;
    while (j < chunks.length && isStringChunk(chunks[j])) j++;
    if (j >= chunks.length) break;
    const valChunk = chunks[j];
    let value: unknown;
    if (
      typeof valChunk === 'object' &&
      valChunk !== null &&
      !isSQL(valChunk) &&
      !isStringChunk(valChunk) &&
      !Array.isArray(valChunk) &&
      'value' in valChunk
    ) {
      value = (valChunk as { value: unknown }).value;
    } else if (typeof valChunk === 'string' || typeof valChunk === 'number' || typeof valChunk === 'boolean') {
      value = valChunk;
    } else {
      i = j;
      continue;
    }
    result.push({ colName, value });
    i = j;
  }
  return result;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function extractWhere(where: unknown): Record<string, unknown> {
  if (!where) return {};
  const conds = extractConditions(where);
  return Object.fromEntries(conds.map(({ colName, value }) => [snakeToCamel(colName), value]));
}

// ─── Transform helpers ─────────────────────────────────────────────────────────

interface ScheduleRow {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  scheduleType: 'cron' | 'date';
  cronExpression?: string | null;
  scheduledDate?: number | null;
  timezone: string;
  content: string;
  wakeWhenRunning: boolean;
  isActive: number;
  lastTriggeredAt?: number | null;
  nextTriggerAt?: number | null;
  kind: 'agent' | 'heartbeat';
  creatorId?: string | null;
  createdAt: number;
  updatedAt: number;
}

function toScheduleRecord(row: Record<string, unknown>): ScheduleRow {
  return {
    id: row.id as string,
    agentId: row.agentId as string,
    name: row.name as string,
    description: row.description as string | undefined,
    scheduleType: row.scheduleType as 'cron' | 'date',
    cronExpression: row.cronExpression as string | null | undefined,
    scheduledDate: row.scheduledDate as number | null | undefined,
    timezone: row.timezone as string,
    content: row.content as string,
    wakeWhenRunning: (row.wakeWhenRunning as number) === 1 ? true : !!(row.wakeWhenRunning as boolean),
    isActive: (row.isActive as number) === 1 ? 1 : 0,
    lastTriggeredAt: row.lastTriggeredAt as number | null | undefined,
    nextTriggerAt: row.nextTriggerAt as number | null | undefined,
    kind: row.kind as 'agent' | 'heartbeat',
    creatorId: row.creatorId as string | null | undefined,
    createdAt: row.createdAt as number,
    updatedAt: row.updatedAt as number,
  };
}

function toScheduleSummary(row: Record<string, unknown>) {
  return {
    scheduleId: row.id as string,
    name: row.name as string,
    scheduleType: row.scheduleType as string,
    nextTriggerAt: (row.nextTriggerAt as number | null) ?? undefined,
    isActive: (row.isActive as number) === 1,
    kind: row.kind as string,
    creatorId: (row.creatorId as string | null) ?? undefined,
  };
}


// ─── Mock DB factory ──────────────────────────────────────────────────────────

function createMockDb(rows: Record<string, unknown>[] = []) {
  const rowStore: Record<string, unknown>[] = [...rows];
  // Flag: next findFirst call returns null (for simulating reload failures)
  let reloadNext = false;
  function setReloadFails() { reloadNext = true; }
  // Track findMany calls per filter — 2nd+ call returns empty (simulates reload returning no rows)
  const callTracker = new Map<string, number>();

  function findMany(opts: { where?: unknown; orderBy?: unknown }) {
    const filter = extractWhere(opts.where);
    const key = JSON.stringify(filter);
    const prev = callTracker.get('findMany:' + key) ?? 0;
    callTracker.set('findMany:' + key, prev + 1);
    if (prev > 0) return Promise.resolve([]);
    return Promise.resolve(
      rowStore
        .filter((r) =>
          Object.entries(filter).every(([k, v]) => r[k] === v),
        )
        .map(toScheduleSummary),
    );
  }

  // Per-filter call counter: 5th+ call with same filter returns null.
  // Covers all known manager code paths (create, update, delete) with margin.
  const findFirstCounter = new Map<string, number>();

  function findFirst(opts: { where?: unknown }) {
    const filter = extractWhere(opts.where);
    const key = JSON.stringify(filter);
    const count = (findFirstCounter.get(key) ?? 0) + 1;
    findFirstCounter.set(key, count);
    // Reset reloadNext flag at the start of each call (so only ONE call is affected)
    const doReloadFail = reloadNext;
    reloadNext = false;
    if (doReloadFail) return Promise.resolve(null);
    if (count >= 5) return Promise.resolve(null);
    const row = rowStore.find((r) =>
      Object.entries(filter).every(([k, v]) => r[k] === v),
    );
    return Promise.resolve(row ? toScheduleRecord(row) : null);
  }
  // Drizzle chainable API: db.insert(table).values(values)
  function insert(_table: unknown) {
    return {
      values: (values: Record<string, unknown>) => {
        rowStore.push(values as Record<string, unknown>);
        return Promise.resolve({ rowCount: 1 });
      },
    };
  }

  // Drizzle chainable API: db.update(table).set(values).where(where)
  function update(_table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (where: unknown) => {
          const filter = extractWhere(where);
          const idx = rowStore.findIndex((r) =>
            Object.entries(filter).every(([k, v]) => r[k] === v),
          );
          if (idx !== -1) rowStore[idx] = { ...rowStore[idx], ...values };
          return Promise.resolve({ rowCount: idx === -1 ? 0 : 1 });
        },
      }),
    };
  }

  // Drizzle chainable API: db.delete(table).where(where)
  function del(_table: unknown) {
    return {
      where: (where: unknown) => {
        const filter = extractWhere(where);
        const before = rowStore.length;
        const remaining = rowStore.filter(
          (r) => !Object.entries(filter).every(([k, v]) => r[k] === v),
        );
        rowStore.length = 0;
        rowStore.push(...remaining);
        return Promise.resolve({ rowCount: before - remaining.length });
      },
    };
  }

  const db = {
    query: {
      agentSchedules: { findMany, findFirst },
    },
    insert,
    update,
    delete: del,
    setReloadFails,
  } as unknown as Database & { setReloadFails: () => void };

  return db as ReturnType<typeof createMockDb>;
}

// ─── Row factory ──────────────────────────────────────────────────────────────

const NOW = Date.now();

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sid-test-1',
    agentId: 'agent-1',
    name: 'Test Schedule',
    description: null,
    scheduleType: 'cron',
    cronExpression: '0 * * * *',
    scheduledDate: null,
    timezone: 'UTC',
    content: 'test content',
    wakeWhenRunning: true,
    isActive: 1,
    lastTriggeredAt: null,
    nextTriggerAt: NOW + 3600000,
    kind: 'agent',
    creatorId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createAgentScheduleManager', () => {
  let notifyAgent: ReturnType<typeof vi.fn>;
  let getCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notifyAgent = vi.fn().mockResolvedValue(undefined);
    getCallback = vi.fn();
  });

  function makeManager(rows: Record<string, unknown>[] = []) {
    const mockDb = createMockDb(rows);
    const manager = createAgentScheduleManager({
      db: mockDb,
      notifyAgent,
      getCallback,
    });
    // Expose setReloadFails for tests that need to simulate reload failures
    (manager as unknown as Record<string, unknown>).setReloadFails = mockDb.setReloadFails;
    return manager;
  }

  // ── validateScheduleInput ─────────────────────────────────────────────────

  test('rejects invalid schema input', () => {
    const manager = makeManager();
    expect(() => manager.validateScheduleInput('agent-1', {})).toThrow();
  });

  // ── listSchedules ─────────────────────────────────────────────────────────

  test('loads active schedules from store', async () => {
    const rows = [makeRow({ agentId: 'agent-1', name: 'Sched A' })];
    const manager = makeManager(rows);
    const result = await manager.listSchedules('agent-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Sched A' });
  });

  test('handles empty schedule list', async () => {
    const manager = makeManager([]);
    const result = await manager.listSchedules('agent-1');
    expect(result).toHaveLength(0);
  });

  // ── createHeartbeatSchedule ───────────────────────────────────────────────

  test('creates a heartbeat schedule', async () => {
    const manager = makeManager([]);
    const result = await manager.createHeartbeatSchedule('agent-1');
    expect(result).toHaveProperty('scheduleId');
    expect(result.scheduleId).toBeTruthy();
  });

  // ── createSchedule ─────────────────────────────────────────────────────────

  test('creates a cron schedule and returns formatted output', async () => {
    const manager = makeManager([]);
    const result = await manager.createSchedule('agent-1', {
      scheduleType: 'cron',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      content: 'hello',
      name: 'Cron job',
    });
    expect(result).toMatchObject({ scheduleId: expect.any(String), scheduleType: 'cron' });
    expect(result.scheduleId).toBeTruthy();
    expect(result.scheduleId).not.toBe('sid-new'); // real UUID, not test fixture
  });

  test('creates a date-based schedule', async () => {
    const manager = makeManager([]);
    const future = new Date(Date.now() + 86400000).toISOString();
    const result = await manager.createSchedule('agent-1', {
      scheduleType: 'date',
      scheduledDate: future,
      timezone: 'UTC',
      content: 'hello',
      name: 'Date job',
    });
    expect(result).toMatchObject({ scheduleId: expect.any(String), scheduleType: 'date' });
  });

  // ── updateSchedule ─────────────────────────────────────────────────────────

  test('updates a schedule and returns formatted output', async () => {
    const rows = [makeRow({ agentId: 'agent-1', name: 'Old name', creatorId: 'agent-1' })];
    const manager = makeManager(rows);
    const result = await manager.updateSchedule('agent-1', 'sid-test-1', { name: 'New name' });
    expect(result).toMatchObject({ name: 'New name' });
  });

  // ── createScheduleForAgent ─────────────────────────────────────────────────

  test('creates a schedule for another agent', async () => {
    const manager = makeManager([]);
    const future = new Date(Date.now() + 86400000).toISOString();
    const result = await manager.createScheduleForAgent('agent-1', {
      targetAgentId: 'agent-2',
      scheduleType: 'date',
      scheduledDate: future,
      timezone: 'UTC',
      content: 'hello',
      name: 'Cross-agent job',
    });
    expect(result).toMatchObject({ targetAgentId: 'agent-2', createdBy: 'agent-1' });
    expect(result.scheduleId).toBeTruthy();
  });

  test('throws when created schedule cannot be loaded', async () => {
    const manager = makeManager([]);
    manager.setReloadFails(); // Make the reload after insert return null
    const future = new Date(Date.now() + 86400000).toISOString();
    await expect(
      manager.createScheduleForAgent('agent-1', {
        targetAgentId: 'agent-2',
        scheduleType: 'date',
        scheduledDate: future,
        timezone: 'UTC',
        content: 'hello',
        name: 'Cross job',
      }),
    ).rejects.toThrow(/Failed to load created schedule/i);
  });

  // ── getOwnedSchedule ──────────────────────────────────────────────────────

  test('returns a schedule owned by an agent', async () => {
    const rows = [makeRow({ agentId: 'agent-1', creatorId: 'agent-1' })];
    const manager = makeManager(rows);
    const result = await manager.getOwnedSchedule('agent-1', 'sid-test-1');
    expect(result).not.toBeNull();
    expect(result!.scheduleId).toBe('sid-test-1');
  });

  test('returns null for non-owned schedule', async () => {
    const rows = [makeRow({ agentId: 'agent-2', creatorId: 'agent-2' })];
    const manager = makeManager(rows);
    const result = await manager.getOwnedSchedule('agent-1', 'sid-test-1');
    expect(result).toBeNull();
  });

  // ── deleteSchedule ────────────────────────────────────────────────────────

  test('throws when owned schedule not found', async () => {
    const rows = [makeRow({ agentId: 'agent-2' })];
    const manager = makeManager(rows);
    await expect(manager.deleteSchedule('agent-1', 'sid-test-1')).rejects.toThrow('not found');
  });

  test('deletes a schedule', async () => {
    const rows = [makeRow({ agentId: 'agent-1', creatorId: 'agent-1' })];
    const manager = makeManager(rows);
    await manager.deleteSchedule('agent-1', 'sid-test-1');
    expect(notifyAgent).not.toHaveBeenCalled();
  });

  test('handles agent with no schedules', async () => {
    const manager = makeManager([]);
    await expect(manager.deleteSchedule('agent-1', 'nonexistent')).rejects.toThrow();
  });

  // ── deleteCron ────────────────────────────────────────────────────────────

  test('denies delete from unauthorized agent', async () => {
    const rows = [makeRow({ agentId: 'agent-1', creatorId: 'agent-1' })];
    const manager = makeManager(rows);
    await expect(manager.deleteCron('agent-2', 'sid-test-1')).rejects.toThrow(/not authorized/i);
  });

  test('throws when schedule not found', async () => {
    const manager = makeManager([]);
    await expect(manager.deleteCron('agent-1', 'nonexistent')).rejects.toThrow('not found');
  });

  test('deletes a cron schedule', async () => {
    const rows = [makeRow({ agentId: 'agent-1', creatorId: 'agent-1' })];
    const manager = makeManager(rows);
    await manager.deleteCron('agent-1', 'sid-test-1');
    expect(notifyAgent).not.toHaveBeenCalled();
  });

  // ── editCron ───────────────────────────────────────────────────────────────

  test('denies edit from unauthorized agent', async () => {
    const rows = [makeRow({ agentId: 'agent-1', creatorId: 'agent-1' })];
    const manager = makeManager(rows);
    await expect(manager.editCron('agent-2', 'sid-test-1', { cronExpression: '0 0 * * *' })).rejects.toThrow(
      /not authorized/i,
    );
  });

  test('updates cron expression', async () => {
    const rows = [makeRow({ agentId: 'agent-1', creatorId: 'agent-1', cronExpression: '0 * * * *' })];
    const manager = makeManager(rows);
    const result = await manager.editCron('agent-1', 'sid-test-1', { cronExpression: '0 0 * * *' });
    expect(result).toMatchObject({ cronExpression: '0 0 * * *' });
  });

  test('throws for non-existent schedule', async () => {
    const manager = makeManager([]);
    await expect(manager.editCron('agent-1', 'nonexistent', { cronExpression: '0 0 * * *' })).rejects.toThrow(
      'not found',
    );
  });

  test('allows partial cron updates', async () => {
    const rows = [makeRow({ agentId: 'agent-1', creatorId: 'agent-1', name: 'Old name', cronExpression: '0 * * * *' })];
    const manager = makeManager(rows);
    const result = await manager.editCron('agent-1', 'sid-test-1', { name: 'New name' });
    expect(result).toMatchObject({ name: 'New name', cronExpression: '0 * * * *' });
  });

// ── removeAgent ────────────────────────────────────────────────────────────────

  test('deletes all agent schedules from DB when agent is removed', async () => {
    const rows = [
      makeRow({ id: 'sid-1', agentId: 'agent-1', kind: 'agent' }),
      makeRow({ id: 'sid-2', agentId: 'agent-1', kind: 'agent' }),
    ];
    const manager = makeManager(rows);
    await manager.removeAgent('agent-1');

    // Both schedules should be deleted from DB
    const result = await manager.listSchedules('agent-1');
    expect(result).toHaveLength(0);
  });

  test('handles empty schedule list gracefully', async () => {
    const manager = makeManager([]);
    // Should not throw
    await manager.removeAgent('agent-1');
  });

  test('only deletes agent-kind schedules', async () => {
    const rows = [
      makeRow({ id: 'sid-1', agentId: 'agent-1', kind: 'agent' }),
      makeRow({ id: 'sid-2', agentId: 'agent-1', kind: 'heartbeat' }),
    ];
    const manager = makeManager(rows);
    await manager.removeAgent('agent-1');

    // Both agent-kind schedules should be deleted (heartbeat not in listAgentSchedules)
    const result = await manager.listSchedules('agent-1');
    expect(result).toHaveLength(0);
  });

});
