import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createAgentScheduleStore } from './store';

// --- Mock Database helpers ---

function createMockRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sch_test001',
    agentId: 'ag_test001',
    kind: 'agent',
    name: 'Test Schedule',
    description: null,
    scheduleType: 'cron',
    cronExpression: '0 9 * * *',
    scheduledDate: null,
    timezone: 'America/Sao_Paulo',
    content: 'Do the thing',
    wakeWhenRunning: 0,
    isActive: 1,
    lastTriggeredAt: null,
    nextTriggerAt: null,
    creatorId: null,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

function createMockDb(rows: Record<string, unknown>[]) {
  const rowMap = new Map<string, Record<string, unknown>[]>();
  rows.forEach((r) => {
    const key = r['agentId'] as string;
    if (!rowMap.has(key)) rowMap.set(key, []);
    rowMap.get(key)!.push(r);
  });

  return {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
    query: {
      agentSchedules: {
        findMany: vi.fn(async ({ where }: { where?: (q: unknown) => boolean }) => {
          if (!where) return rows;
          return rows.filter((r) => {
            // Very basic: check for eq conditions
            return rows;
          });
        }),
        findFirst: vi.fn(async (opts: { where?: (q: unknown) => boolean }) => {
          const conditions = opts['where'] as unknown as Array<{ 0: (q: unknown) => boolean }>;
          if (!conditions || conditions.length === 0) return rows[0] ?? null;
          // Just return first matching row for simplicity
          return rows[0] ?? null;
        }),
      },
    },
    _rows: rows,
    _rowMap: rowMap,
  };
}

// --- Tests ---

describe('createAgentScheduleStore', () => {
  it('returns an object with all expected methods', () => {
    const db = createMockDb([]);
    const store = createAgentScheduleStore(db as any);
    expect(store).toHaveProperty('createSchedule');
    expect(store).toHaveProperty('listAgentSchedules');
    expect(store).toHaveProperty('listActiveSchedules');
    expect(store).toHaveProperty('listCreatedAgentSchedules');
    expect(store).toHaveProperty('getAgentSchedule');
    expect(store).toHaveProperty('getOwnedSchedule');
    expect(store).toHaveProperty('getScheduleByKind');
    expect(store).toHaveProperty('getScheduleById');
    expect(store).toHaveProperty('updateAgentSchedule');
    expect(store).toHaveProperty('updateOwnedSchedule');
    expect(store).toHaveProperty('deleteAgentSchedule');
    expect(store).toHaveProperty('deactivateSchedule');
    expect(store).toHaveProperty('setNextTriggerAt');
    expect(store).toHaveProperty('markTriggered');
  });
});

describe('createSchedule', () => {
  it('calls db.insert with the correct record structure', async () => {
    const db = createMockDb([]);
    const store = createAgentScheduleStore(db as any);

    await store.createSchedule({
      agentId: 'ag_001',
      kind: 'agent',
      name: 'Daily Report',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'America/Sao_Paulo',
      content: 'Run the report',
    });

    expect(db.insert).toHaveBeenCalled();
    const insertCall = (db.insert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(insertCall[0]).toBeDefined(); // agentSchedules table
  });

  it('default wakeWhenRunning to 1 (true) when not provided', async () => {
    let captured: Record<string, unknown> = {};
    const db = createMockDb([]);
    db.values = vi.fn((r: Record<string, unknown>) => {
      captured = r;
      return Promise.resolve();
    });
    const store = createAgentScheduleStore(db as any);

    await store.createSchedule({
      agentId: 'ag_001',
      kind: 'agent',
      name: 'Test',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Test content',
    });

    expect(captured.wakeWhenRunning).toBe(1);
  });

  it('sets wakeWhenRunning to 0 when explicitly false', async () => {
    let captured: Record<string, unknown> = {};
    const db = createMockDb([]);
    db.values = vi.fn((r: Record<string, unknown>) => {
      captured = r;
      return Promise.resolve();
    });
    const store = createAgentScheduleStore(db as any);

    await store.createSchedule({
      agentId: 'ag_001',
      kind: 'agent',
      name: 'Test',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Test content',
      wakeWhenRunning: false,
    });

    expect(captured.wakeWhenRunning).toBe(0);
  });

  it('returns the created record with id and timestamps', async () => {
    const db = createMockDb([]);
    const store = createAgentScheduleStore(db as any);

    const result = await store.createSchedule({
      agentId: 'ag_001',
      kind: 'agent',
      name: 'Test',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Test content',
    });

    expect(result).toHaveProperty('id');
    expect(typeof result.id).toBe('string');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('updatedAt');
    expect(result.agentId).toBe('ag_001');
    expect(result.name).toBe('Test');
  });
});

describe('listAgentSchedules', () => {
  it('returns only agent-kind schedules as summaries', async () => {
    const rows = [
      createMockRow({ id: 'sch_001', agentId: 'ag_001', kind: 'agent' }),
      createMockRow({ id: 'sch_002', agentId: 'ag_001', kind: 'heartbeat' }),
      createMockRow({ id: 'sch_003', agentId: 'ag_001', kind: 'agent' }),
    ];
    const db = createMockDb(rows);
    db.query.agentSchedules.findMany = vi.fn(async () => rows);
    const store = createAgentScheduleStore(db as any);

    const result = await store.listAgentSchedules('ag_001');
    expect(result).toHaveLength(2);
    expect(result.map((s: { scheduleId: string }) => s.scheduleId)).toEqual(['sch_001', 'sch_003']);
  });

  it('includes scheduleId field in returned summaries', async () => {
    const rows = [createMockRow({ id: 'sch_001', agentId: 'ag_001', kind: 'agent' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findMany = vi.fn(async () => rows);
    const store = createAgentScheduleStore(db as any);

    const result = await store.listAgentSchedules('ag_001');
    expect(result[0]).toHaveProperty('scheduleId', 'sch_001');
  });

  it('maps isActive=1 to boolean true', async () => {
    const rows = [createMockRow({ id: 'sch_001', agentId: 'ag_001', isActive: 1 })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findMany = vi.fn(async () => rows);
    const store = createAgentScheduleStore(db as any);

    const result = await store.listAgentSchedules('ag_001');
    expect(result[0].isActive).toBe(true);
  });

  it('maps isActive=0 to boolean false', async () => {
    const rows = [createMockRow({ id: 'sch_001', agentId: 'ag_001', isActive: 0 })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findMany = vi.fn(async () => rows);
    const store = createAgentScheduleStore(db as any);

    const result = await store.listAgentSchedules('ag_001');
    expect(result[0].isActive).toBe(false);
  });
});

describe('listActiveSchedules', () => {
  it('returns all active schedules as records', async () => {
    const rows = [
      createMockRow({ id: 'sch_001', isActive: 1 }),
      createMockRow({ id: 'sch_002', isActive: 1 }),
      createMockRow({ id: 'sch_003', isActive: 0 }),
    ];
    const db = createMockDb(rows);
    db.query.agentSchedules.findMany = vi.fn(async () => rows.filter((r) => r.isActive === 1));
    const store = createAgentScheduleStore(db as any);

    const result = await store.listActiveSchedules();
    expect(result).toHaveLength(2);
  });

  it('records include lastTriggeredAt and nextTriggerAt', async () => {
    const rows = [
      createMockRow({
        id: 'sch_001',
        lastTriggeredAt: 1700000000000,
        nextTriggerAt: 1700010000000,
        isActive: 1,
      }),
    ];
    const db = createMockDb(rows);
    db.query.agentSchedules.findMany = vi.fn(async () => rows);
    const store = createAgentScheduleStore(db as any);

    const result = await store.listActiveSchedules();
    expect(result[0].lastTriggeredAt).toBe(1700000000000);
    expect(result[0].nextTriggerAt).toBe(1700010000000);
  });

  it('records include creatorId', async () => {
    const rows = [createMockRow({ id: 'sch_001', creatorId: 'ag_creator', isActive: 1 })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findMany = vi.fn(async () => rows);
    const store = createAgentScheduleStore(db as any);

    const result = await store.listActiveSchedules();
    expect(result[0].creatorId).toBe('ag_creator');
  });
});

describe('getAgentSchedule', () => {
  it('returns null when schedule not found', async () => {
    const db = createMockDb([]);
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => null);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getAgentSchedule('ag_001', 'sch_nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for heartbeat kind (only agent kind allowed)', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'heartbeat' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getAgentSchedule('ag_001', 'sch_hb');
    expect(result).toBeNull();
  });

  it('returns schedule record for agent kind', async () => {
    const rows = [
      createMockRow({ id: 'sch_001', agentId: 'ag_001', kind: 'agent', name: 'My Schedule' }),
    ];
    const db = createMockDb(rows);
    // findFirst returns row[0] which is agent kind -> toScheduleRecord -> has scheduleId
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getAgentSchedule('ag_001', 'sch_001');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('My Schedule');
    expect(result!.scheduleId).toBe('sch_001');
  });
});

// Tests for getScheduleById — previously not covered
describe('getScheduleById', () => {
  it('returns null when schedule not found', async () => {
    const db = createMockDb([]);
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => null);
    const store = createAgentScheduleStore(db as any);
    const result = await store.getScheduleById('sch_nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for heartbeat kind', async () => {
    const rows = [createMockRow({ id: 'sch_hb', agentId: 'ag_001', kind: 'heartbeat' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);
    const result = await store.getScheduleById('sch_hb');
    expect(result).toBeNull();
  });

  it('returns schedule record for agent kind', async () => {
    const rows = [
      createMockRow({ id: 'sch_001', agentId: 'ag_001', kind: 'agent', name: 'My Schedule' }),
    ];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);
    const result = await store.getScheduleById('sch_001');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('My Schedule');
  });
});

describe('getOwnedSchedule', () => {
  it('returns null when schedule not found', async () => {
    const db = createMockDb([]);
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => null);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getOwnedSchedule('ag_001', 'sch_nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for heartbeat kind', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'heartbeat' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getOwnedSchedule('ag_001', 'sch_hb');
    expect(result).toBeNull();
  });

  it('returns schedule record for agent kind', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'agent' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getOwnedSchedule('ag_001', 'sch_001');
    expect(result).not.toBeNull();
  });
});

describe('getScheduleByKind', () => {
  it('returns null when not found', async () => {
    const db = createMockDb([]);
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => null);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getScheduleByKind('ag_001', 'agent');
    expect(result).toBeNull();
  });

  it('returns schedule matching kind', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'agent', name: 'By Kind' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getScheduleByKind('ag_001', 'agent');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('By Kind');
  });

  it('returns null when kind does not match', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'heartbeat' })];
    const db = createMockDb(rows);
    // heartbeat row found but agent query -> returns null (heartbeat kind filtered out)
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => null);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getScheduleByKind('ag_001', 'agent');
    expect(result).toBeNull();
  });
});

describe('getScheduleById', () => {
  it('returns null when not found', async () => {
    const db = createMockDb([]);
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => null);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getScheduleById('sch_nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for heartbeat kind', async () => {
    const rows = [createMockRow({ kind: 'heartbeat' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getScheduleById('sch_hb');
    expect(result).toBeNull();
  });

  it('returns schedule record for agent kind', async () => {
    const rows = [createMockRow({ kind: 'agent', name: 'By ID' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);

    const result = await store.getScheduleById('sch_001');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('By ID');
  });
});

describe('updateAgentSchedule', () => {
  it('returns null when schedule not found', async () => {
    const db = createMockDb([]);
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => null);
    const store = createAgentScheduleStore(db as any);

    const result = await store.updateAgentSchedule('ag_001', 'sch_nonexistent', {
      name: 'New Name',
    });
    expect(result).toBeNull();
  });

  it('returns null for heartbeat kind', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'heartbeat' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);

    const result = await store.updateAgentSchedule('ag_001', 'sch_hb', { name: 'New' });
    expect(result).toBeNull();
  });

  it('calls db.update with merged fields', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'agent', name: 'Old Name' })];
    const db = createMockDb(rows);
    // First call: find existing, Second call: getAgentSchedule after update
    let findFirstCallCount = 0;
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => {
      findFirstCallCount++;
      return findFirstCallCount === 1 ? rows[0] : null;
    });
    db.update = vi.fn().mockReturnThis();
    db.set = vi.fn().mockReturnThis();
    (db as any).where = vi.fn().mockResolvedValue(undefined);
    const store = createAgentScheduleStore(db as any);

    await store.updateAgentSchedule('ag_001', 'sch_001', { name: 'New Name' });
    expect(db.update).toHaveBeenCalled();
  });
});

describe('updateOwnedSchedule', () => {
  it('returns null when schedule not found', async () => {
    const db = createMockDb([]);
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => null);
    const store = createAgentScheduleStore(db as any);
    const result = await store.updateOwnedSchedule('ag_001', 'sch_nonexistent', {
      name: 'New Name',
    });
    expect(result).toBeNull();
  });

  it('returns null for heartbeat kind', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'heartbeat' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);
    const result = await store.updateOwnedSchedule('ag_001', 'sch_hb', { name: 'New' });
    expect(result).toBeNull();
  });

  it('calls db.update with merged fields', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'agent', name: 'Old Name' })];
    const db = createMockDb(rows);
    let findFirstCallCount = 0;
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => {
      findFirstCallCount++;
      return findFirstCallCount === 1 ? rows[0] : null;
    });
    db.update = vi.fn().mockReturnThis();
    db.set = vi.fn().mockReturnThis();
    (db as any).where = vi.fn().mockResolvedValue(undefined);
    const store = createAgentScheduleStore(db as any);
    await store.updateOwnedSchedule('ag_001', 'sch_001', { name: 'New Name' });
    expect(db.update).toHaveBeenCalled();
  });
});

describe('deleteAgentSchedule', () => {
  it('returns false when schedule not found', async () => {
    const db = createMockDb([]);
    (db.query.agentSchedules as any).findFirst = vi.fn(async () => null);
    const store = createAgentScheduleStore(db as any);

    const result = await store.deleteAgentSchedule('ag_001', 'sch_nonexistent');
    expect(result).toBe(false);
  });

  it('returns false for heartbeat kind', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'heartbeat' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    const store = createAgentScheduleStore(db as any);

    const result = await store.deleteAgentSchedule('ag_001', 'sch_hb');
    expect(result).toBe(false);
  });

  it('calls db.delete when schedule found and is agent kind', async () => {
    const rows = [createMockRow({ agentId: 'ag_001', kind: 'agent' })];
    const db = createMockDb(rows);
    db.query.agentSchedules.findFirst = vi.fn(async () => rows[0]);
    db.delete = vi.fn().mockReturnThis();
    (db as any).where = vi.fn().mockResolvedValue(undefined);
    const store = createAgentScheduleStore(db as any);

    const result = await store.deleteAgentSchedule('ag_001', 'sch_001');
    expect(result).toBe(true);
    expect(db.delete).toHaveBeenCalled();
  });
});

describe('deactivateSchedule', () => {
  it('calls db.update with isActive=0 and null nextTriggerAt', async () => {
    const db = createMockDb([]);
    db.update = vi.fn().mockReturnThis();
    db.set = vi.fn().mockReturnThis();
    (db as any).where = vi.fn().mockResolvedValue(undefined);
    const store = createAgentScheduleStore(db as any);

    await store.deactivateSchedule('sch_001');
    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalled();
    const setCall = (db.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(setCall.isActive).toBe(0);
    expect(setCall.nextTriggerAt).toBeNull();
  });
});

describe('setNextTriggerAt', () => {
  it('calls db.update with nextTriggerAt value', async () => {
    const db = createMockDb([]);
    db.update = vi.fn().mockReturnThis();
    db.set = vi.fn().mockReturnThis();
    (db as any).where = vi.fn().mockResolvedValue(undefined);
    const store = createAgentScheduleStore(db as any);

    await store.setNextTriggerAt('sch_001', 1700100000000);
    expect(db.update).toHaveBeenCalled();
    const setCall = (db.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(setCall.nextTriggerAt).toBe(1700100000000);
  });

  it('accepts null to clear nextTriggerAt', async () => {
    const db = createMockDb([]);
    db.update = vi.fn().mockReturnThis();
    db.set = vi.fn().mockReturnThis();
    (db as any).where = vi.fn().mockResolvedValue(undefined);
    const store = createAgentScheduleStore(db as any);

    await store.setNextTriggerAt('sch_001', null);
    const setCall = (db.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(setCall.nextTriggerAt).toBeNull();
  });
});

describe('markTriggered', () => {
  it('calls db.update with lastTriggeredAt, nextTriggerAt, and isActive', async () => {
    const db = createMockDb([]);
    db.update = vi.fn().mockReturnThis();
    db.set = vi.fn().mockReturnThis();
    (db as any).where = vi.fn().mockResolvedValue(undefined);
    const store = createAgentScheduleStore(db as any);

    await store.markTriggered({
      scheduleId: 'sch_001',
      lastTriggeredAt: 1700000000000,
      nextTriggerAt: 1700010000000,
      isActive: true,
    });

    expect(db.update).toHaveBeenCalled();
    const setCall = (db.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(setCall.lastTriggeredAt).toBe(1700000000000);
    expect(setCall.nextTriggerAt).toBe(1700010000000);
    expect(setCall.isActive).toBe(1);
  });

  it('sets isActive=0 when isActive is false', async () => {
    const db = createMockDb([]);
    db.update = vi.fn().mockReturnThis();
    db.set = vi.fn().mockReturnThis();
    (db as any).where = vi.fn().mockResolvedValue(undefined);
    const store = createAgentScheduleStore(db as any);

    await store.markTriggered({
      scheduleId: 'sch_001',
      lastTriggeredAt: 1700000000000,
      nextTriggerAt: null,
      isActive: false,
    });

    const setCall = (db.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(setCall.isActive).toBe(0);
  });
});

describe('listCreatedAgentSchedules', () => {
  it('returns only agent-kind schedules created by the given creator', async () => {
    const rows = [
      createMockRow({ id: 'sch_001', creatorId: 'ag_creator', kind: 'agent' }),
      createMockRow({ id: 'sch_002', creatorId: 'ag_other', kind: 'agent' }),
      createMockRow({ id: 'sch_003', creatorId: 'ag_creator', kind: 'heartbeat' }),
    ];
    const db = createMockDb(rows);
    db.query.agentSchedules.findMany = vi.fn(async () =>
      rows.filter((r) => r.creatorId === 'ag_creator'),
    );
    const store = createAgentScheduleStore(db as any);

    const result = await store.listCreatedAgentSchedules('ag_creator');
    expect(result).toHaveLength(1);
    expect(result[0].scheduleId).toBe('sch_001');
  });

  it('filters by targetAgentId when provided', async () => {
    const rows = [
      createMockRow({
        id: 'sch_001',
        creatorId: 'ag_creator',
        agentId: 'ag_target',
        kind: 'agent',
      }),
      createMockRow({ id: 'sch_002', creatorId: 'ag_creator', agentId: 'ag_other', kind: 'agent' }),
    ];
    const db = createMockDb(rows);
    db.query.agentSchedules.findMany = vi.fn(async () =>
      rows.filter((r) => r.creatorId === 'ag_creator' && r.agentId === 'ag_target'),
    );
    const store = createAgentScheduleStore(db as any);

    const result = await store.listCreatedAgentSchedules('ag_creator', 'ag_target');
    expect(result).toHaveLength(1);
    expect(result[0].scheduleId).toBe('sch_001');
  });
});
