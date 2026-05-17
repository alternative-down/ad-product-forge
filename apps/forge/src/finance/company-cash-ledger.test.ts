import { describe, expect, test, beforeEach } from 'vitest';
import { createCompanyCashLedger } from './company-cash-ledger';
import { createCompanyCashOperations } from './company-cash-operations';

// ─── Drizzle 0.26.x chunk helpers ─────────────────────────────────────────────

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
    if (value === undefined) {
      // isNotNull / isNull have no value operand — skip so they don't add
      // a spurious undefined filter that findFirst would try to ===-match.
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

// ─── Row type ─────────────────────────────────────────────────────────────────

interface CashLedgerRow {
  id: string;
  type: string;
  direction: 'in' | 'out';
  amountUsd: number;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  status: 'planned' | 'posted' | 'canceled';
  dueAt?: number | null;
  effectiveAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

// ─── Mock DB factory ──────────────────────────────────────────────────────────

function createMockCashDb(initialRows: CashLedgerRow[] = []) {
  const rowStore: CashLedgerRow[] = [...initialRows];

  function findFirst(opts: { where?: unknown }) {
    const filter = extractWhere(opts.where);
    const row = rowStore.find((r) =>
      Object.entries(filter).every(([k, v]) => r[k as keyof CashLedgerRow] === v),
    );
    return Promise.resolve(row ?? null);
  }

  function insert(_table: unknown) {
    return {
      values: (values: Partial<CashLedgerRow>) => {
        rowStore.push(values as CashLedgerRow);
        return Promise.resolve({ rowCount: 1 });
      },
    };
  }

  function update(_table: unknown) {
    let capturedValues: Record<string, unknown> | undefined;
    return {
      set: (values: Record<string, unknown>) => {
        capturedValues = values;
        return {
          where: (where: unknown) => {
            const filter = extractWhere(where);
            const idx = rowStore.findIndex((r) =>
              Object.entries(filter).every(([k, v]) => r[k as keyof CashLedgerRow] === v),
            );
            if (idx !== -1) rowStore[idx] = { ...rowStore[idx], ...capturedValues } as CashLedgerRow;
            return Promise.resolve({ rowCount: idx === -1 ? 0 : 1 });
          },
        };
      },
    };
  }

  // db.select({ total: sql`...` }).from(table).where(where)
  // Computes sum(case when direction='in' then amount else -amount end) over filtered rows.
  function select(_table: unknown) {
    return {
      _sumCol: 'amountUsd',
      _dirCol: 'direction',
      from: () => ({
        where: (where: unknown) => {
          const filter = extractWhere(where);
          const filtered = rowStore.filter((r) =>
            Object.entries(filter).every(([k, v]) => r[k as keyof CashLedgerRow] === v),
          );
          const total = filtered.reduce((acc, r) => {
            return acc + (r.direction === 'in' ? r.amountUsd : -r.amountUsd);
          }, 0);
          return Promise.resolve([{ total }]);
        },
      }),
    };
  }

  const db = {
    select,
    insert,
    update,
    query: {
      companyCashLedger: { findFirst },
    },
  } as unknown as {
    select: (table: unknown) => ReturnType<typeof select>;
    insert: (table: unknown) => ReturnType<ReturnType<typeof insert>['values']> extends Promise<infer T> ? { values: (v: unknown) => Promise<T> } : never;
    update: (table: unknown) => any;
    query: { companyCashLedger: { findFirst: typeof findFirst } };
  };

  return { db, rowStore };
}

// ─── Factories ────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<CashLedgerRow> = {}): CashLedgerRow {
  return {
    id: 'entry-1',
    type: 'test',
    direction: 'in',
    amountUsd: 100,
    status: 'posted',
    effectiveAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── company-cash-ledger ──────────────────────────────────────────────────────

describe('company-cash-ledger', () => {
  test('getCurrentBalanceUsd returns 0 for empty ledger', async () => {
    const { db } = createMockCashDb([]);
    const { getCurrentBalanceUsd } = createCompanyCashLedger(db as never);
    await expect(getCurrentBalanceUsd()).resolves.toBe(0);
  });

  test('getCurrentBalanceUsd sums posted in/out entries correctly', async () => {
    const now = Date.now();
    const { db } = createMockCashDb([
      makeEntry({ id: 'e1', direction: 'in', amountUsd: 100, status: 'posted', effectiveAt: now }),
      makeEntry({ id: 'e2', direction: 'out', amountUsd: 30, status: 'posted', effectiveAt: now }),
      makeEntry({ id: 'e3', direction: 'in', amountUsd: 50, status: 'posted', effectiveAt: now }),
    ]);
    const { getCurrentBalanceUsd } = createCompanyCashLedger(db as never);
    await expect(getCurrentBalanceUsd()).resolves.toBe(120); // 100-30+50
  });

  test('getCurrentBalanceUsd ignores planned and canceled entries', async () => {
    const now = Date.now();
    const { db } = createMockCashDb([
      makeEntry({ id: 'e1', direction: 'in', amountUsd: 100, status: 'posted', effectiveAt: now }),
      makeEntry({ id: 'e2', direction: 'in', amountUsd: 999, status: 'planned', effectiveAt: now }),
      makeEntry({ id: 'e3', direction: 'in', amountUsd: 888, status: 'canceled', effectiveAt: now }),
    ]);
    const { getCurrentBalanceUsd } = createCompanyCashLedger(db as never);
    await expect(getCurrentBalanceUsd()).resolves.toBe(100);
  });

  test('getCurrentBalanceUsd ignores future effectiveAt entries', async () => {
    const now = Date.now();
    const future = now + 86400_000;
    const { db } = createMockCashDb([
      makeEntry({ id: 'e1', direction: 'in', amountUsd: 100, status: 'posted', effectiveAt: now }),
      makeEntry({ id: 'e2', direction: 'in', amountUsd: 999, status: 'posted', effectiveAt: future }),
    ]);
    const { getCurrentBalanceUsd } = createCompanyCashLedger(db as never);
    await expect(getCurrentBalanceUsd()).resolves.toBe(100);
  });

  test('postEntry inserts entry and returns void', async () => {
    const { db, rowStore } = createMockCashDb([]);
    const { postEntry } = createCompanyCashLedger(db as never);
    const now = Date.now();
    await postEntry({
      type: 'refund',
      direction: 'in',
      amountUsd: 250,
      description: 'Test refund',
    });
    expect(rowStore).toHaveLength(1);
    expect(rowStore[0].type).toBe('refund');
    expect(rowStore[0].direction).toBe('in');
    expect(rowStore[0].amountUsd).toBe(250);
    expect(rowStore[0].description).toBe('Test refund');
    expect(rowStore[0].status).toBe('posted');
    expect(typeof rowStore[0].createdAt).toBe('number');
  });

  test('postEntry uses defaults when optional fields are omitted', async () => {
    const { db, rowStore } = createMockCashDb([]);
    const { postEntry } = createCompanyCashLedger(db as never);
    await postEntry({
      type: 'refund',
      direction: 'out',
      amountUsd: 50,
    });
    expect(rowStore[0].status).toBe('posted');
    expect(rowStore[0].dueAt).toBe(rowStore[0].effectiveAt);
    expect(rowStore[0].effectiveAt).toBe(rowStore[0].createdAt);
  });

  test('postEntry applies custom dueAt and effectiveAt', async () => {
    const { db, rowStore } = createMockCashDb([]);
    const { postEntry } = createCompanyCashLedger(db as never);
    const dueAt = 1_700_000_000_000;
    const effectiveAt = 1_700_000_100_000;
    await postEntry({
      type: 'plan',
      direction: 'in',
      amountUsd: 1,
      dueAt,
      effectiveAt,
    });
    expect(rowStore[0].dueAt).toBe(dueAt);
    expect(rowStore[0].effectiveAt).toBe(effectiveAt);
  });
});

// ─── company-cash-operations ───────────────────────────────────────────────────

describe('company-cash-operations', () => {
  test('recordCashIn creates posted entry with direction in', async () => {
    const { db, rowStore } = createMockCashDb([]);
    const { recordCashIn } = createCompanyCashOperations(db as never);
    await recordCashIn({ type: 'deposit', amountUsd: 500 });
    expect(rowStore).toHaveLength(1);
    expect(rowStore[0].direction).toBe('in');
    expect(rowStore[0].status).toBe('posted');
    expect(rowStore[0].amountUsd).toBe(500);
  });

  test('recordCashIn applies effectiveAt when provided', async () => {
    const { db, rowStore } = createMockCashDb([]);
    const { recordCashIn } = createCompanyCashOperations(db as never);
    const effectiveAt = 1_700_000_000_000;
    await recordCashIn({ type: 'deposit', amountUsd: 500, effectiveAt });
    expect(rowStore[0].effectiveAt).toBe(effectiveAt);
    expect(rowStore[0].dueAt).toBe(effectiveAt);
  });

  test('recordCashOut creates posted entry with direction out', async () => {
    const { db, rowStore } = createMockCashDb([]);
    const { recordCashOut } = createCompanyCashOperations(db as never);
    await recordCashOut({ type: 'withdrawal', amountUsd: 200 });
    expect(rowStore).toHaveLength(1);
    expect(rowStore[0].direction).toBe('out');
    expect(rowStore[0].status).toBe('posted');
    expect(rowStore[0].amountUsd).toBe(200);
  });

  test('scheduleCashIn creates planned entry with direction in', async () => {
    const { db, rowStore } = createMockCashDb([]);
    const { scheduleCashIn } = createCompanyCashOperations(db as never);
    const dueAt = 1_700_000_000_000;
    await scheduleCashIn({ type: 'invoice', amountUsd: 1000, dueAt });
    expect(rowStore).toHaveLength(1);
    expect(rowStore[0].direction).toBe('in');
    expect(rowStore[0].status).toBe('planned');
    expect(rowStore[0].dueAt).toBe(dueAt);
    expect(rowStore[0].effectiveAt).toBeNull();
  });

  test('scheduleCashOut creates planned entry with direction out', async () => {
    const { db, rowStore } = createMockCashDb([]);
    const { scheduleCashOut } = createCompanyCashOperations(db as never);
    const dueAt = 1_700_000_000_000;
    await scheduleCashOut({ type: 'expense', amountUsd: 300, dueAt });
    expect(rowStore).toHaveLength(1);
    expect(rowStore[0].direction).toBe('out');
    expect(rowStore[0].status).toBe('planned');
    expect(rowStore[0].dueAt).toBe(dueAt);
    expect(rowStore[0].effectiveAt).toBeNull();
  });

  test('cancelPlannedEntry updates status to canceled', async () => {
    const now = Date.now();
    const { db } = createMockCashDb([
      makeEntry({ id: 'entry-1', status: 'planned', dueAt: now, effectiveAt: null }),
    ]);
    const { cancelPlannedEntry } = createCompanyCashOperations(db as never);
    await expect(cancelPlannedEntry('entry-1')).resolves.toMatchObject({
      entryId: 'entry-1',
      status: 'canceled',
    });
  });

  test('cancelPlannedEntry throws for non-existent entry', async () => {
    const { db } = createMockCashDb([]);
    const { cancelPlannedEntry } = createCompanyCashOperations(db as never);
    await expect(cancelPlannedEntry('does-not-exist')).rejects.toThrow(
      'Company cash entry not found: does-not-exist',
    );
  });

  test('cancelPlannedEntry throws for non-planned entry', async () => {
    const { db } = createMockCashDb([
      makeEntry({ id: 'entry-1', status: 'posted' }),
    ]);
    const { cancelPlannedEntry } = createCompanyCashOperations(db as never);
    await expect(cancelPlannedEntry('entry-1')).rejects.toThrow(
      'Only planned company cash entries can be canceled: entry-1',
    );
  });

  test('postPlannedEntry updates status to posted with effectiveAt', async () => {
    const now = Date.now();
    const { db } = createMockCashDb([
      makeEntry({ id: 'entry-1', status: 'planned', dueAt: now, effectiveAt: null }),
    ]);
    const { postPlannedEntry } = createCompanyCashOperations(db as never);
    await expect(postPlannedEntry('entry-1')).resolves.toMatchObject({
      entryId: 'entry-1',
      status: 'posted',
      effectiveAt: expect.any(Number),
    });
  });

  test('postPlannedEntry uses provided effectiveAt', async () => {
    const now = Date.now();
    const future = now + 3600_000;
    const { db } = createMockCashDb([
      makeEntry({ id: 'entry-1', status: 'planned', dueAt: now, effectiveAt: null }),
    ]);
    const { postPlannedEntry } = createCompanyCashOperations(db as never);
    await expect(postPlannedEntry('entry-1', { effectiveAt: future })).resolves.toMatchObject({
      entryId: 'entry-1',
      status: 'posted',
      effectiveAt: future,
    });
  });

  test('postPlannedEntry throws for non-existent entry', async () => {
    const { db } = createMockCashDb([]);
    const { postPlannedEntry } = createCompanyCashOperations(db as never);
    await expect(postPlannedEntry('does-not-exist')).rejects.toThrow(
      'Company cash entry not found: does-not-exist',
    );
  });

  test('postPlannedEntry throws for non-planned entry', async () => {
    const { db } = createMockCashDb([
      makeEntry({ id: 'entry-1', status: 'posted' }),
    ]);
    const { postPlannedEntry } = createCompanyCashOperations(db as never);
    await expect(postPlannedEntry('entry-1')).rejects.toThrow(
      'Only planned company cash entries can be posted: entry-1',
    );
  });
});
