import { describe, expect, test, beforeEach } from 'vitest';
import { createCompanyCashOperations } from './company-cash-operations';
import { createCompanyCashLedger } from './company-cash-ledger';

// ─── Drizzle 0.26.x chunk helpers (shared with company-cash-ledger.test.ts) ────

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

function isArrayChunk(x: unknown): boolean {
  return Array.isArray(x);
}

function isColumn(x: unknown): boolean {
  const n = (x as { constructor?: { name?: string } })?.constructor?.name;
  return (
    n === 'SQLiteText' || n === 'SQLiteInteger' || n === 'SQLiteBlob' || n === 'SQLiteReal' ||
    n === 'SQLiteTextBuilder' || n === 'SQLiteIntegerBuilder' ||
    n === 'SQLiteBlobBuilder' || n === 'SQLiteRealBuilder'
  );
}

function extractConditions(sql: unknown): Array<{ colName: string; value: unknown; op?: string }> {
  if (!isSQL(sql)) return [];
  const result: Array<{ colName: string; value: unknown; op?: string }> = [];
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
    // Handle gte/lte/gt/lt array chunks: [column, value]
    if (isArrayChunk(valChunk) && (valChunk as unknown[]).length === 2) {
      value = (valChunk as unknown[])[1];
    } else if (
      typeof valChunk === 'object' &&
      valChunk !== null &&
      !isSQL(valChunk) &&
      !isStringChunk(valChunk) &&
      !isArrayChunk(valChunk) &&
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

// ─── Row type ──────────────────────────────────────────────────────────────────

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
}

// ─── Mock DB factory ────────────────────────────────────────────────────────

function createMockDb(initialRows: CashLedgerRow[] = []): any {
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
        rowStore.push({ ...values, id: values.id ?? `generated-${rowStore.length}` } as CashLedgerRow);
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

  const db = {
    insert,
    update,
    query: {
      companyCashLedger: { findFirst },
    },
  } as any;

  return { db, rowStore };
}

// ─── Factories ─────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<CashLedgerRow> = {}): CashLedgerRow {
  return {
    id: 'entry-1',
    type: 'test',
    direction: 'in',
    amountUsd: 100,
    status: 'posted',
    effectiveAt: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('company-cash-operations', () => {
  describe('recordCashIn', () => {
    test('creates a posted IN entry with correct fields', async () => {
      const { db, rowStore } = createMockDb([]);
      const { recordCashIn } = createCompanyCashOperations(db as never);
      await recordCashIn({
        type: 'income',
        amountUsd: 500,
        description: 'Revenue',
        referenceType: 'invoice',
        referenceId: 'inv-1',
      });
      expect(rowStore).toHaveLength(1);
      expect(rowStore[0].direction).toBe('in');
      expect(rowStore[0].status).toBe('posted');
      expect(rowStore[0].amountUsd).toBe(500);
      expect(rowStore[0].type).toBe('income');
      expect(rowStore[0].description).toBe('Revenue');
      expect(rowStore[0].referenceType).toBe('invoice');
      expect(rowStore[0].referenceId).toBe('inv-1');
      expect(typeof rowStore[0].createdAt).toBe('number');
    });

    test('effectiveAt defaults to Date.now()', async () => {
      const { db, rowStore } = createMockDb([]);
      const { recordCashIn } = createCompanyCashOperations(db as never);
      const before = Date.now();
      await recordCashIn({ type: 'income', amountUsd: 100 });
      const after = Date.now();
      expect(rowStore[0].effectiveAt).toBeGreaterThanOrEqual(before);
      expect(rowStore[0].effectiveAt).toBeLessThanOrEqual(after);
    });

    test('uses provided effectiveAt', async () => {
      const { db, rowStore } = createMockDb([]);
      const { recordCashIn } = createCompanyCashOperations(db as never);
      const custom = 1_700_000_000_000;
      await recordCashIn({ type: 'income', amountUsd: 100, effectiveAt: custom });
      expect(rowStore[0].effectiveAt).toBe(custom);
    });
  });

  describe('recordCashOut', () => {
    test('creates a posted OUT entry with correct fields', async () => {
      const { db, rowStore } = createMockDb([]);
      const { recordCashOut } = createCompanyCashOperations(db as never);
      await recordCashOut({
        type: 'expense',
        amountUsd: 250,
        description: 'Payment',
      });
      expect(rowStore).toHaveLength(1);
      expect(rowStore[0].direction).toBe('out');
      expect(rowStore[0].status).toBe('posted');
      expect(rowStore[0].amountUsd).toBe(250);
      expect(rowStore[0].description).toBe('Payment');
    });
  });

  describe('scheduleCashIn', () => {
    test('creates a planned IN entry with given dueAt', async () => {
      const { db, rowStore } = createMockDb([]);
      const { scheduleCashIn } = createCompanyCashOperations(db as never);
      const dueAt = 1_800_000_000_000;
      await scheduleCashIn({ type: 'invoice', amountUsd: 1000, dueAt });
      expect(rowStore[0].direction).toBe('in');
      expect(rowStore[0].status).toBe('planned');
      expect(rowStore[0].dueAt).toBe(dueAt);
      expect(rowStore[0].effectiveAt).toBeNull();
    });
  });

  describe('scheduleCashOut', () => {
    test('creates a planned OUT entry with given dueAt', async () => {
      const { db, rowStore } = createMockDb([]);
      const { scheduleCashOut } = createCompanyCashOperations(db as never);
      const dueAt = 1_800_000_000_000;
      await scheduleCashOut({ type: 'payroll', amountUsd: 5000, dueAt });
      expect(rowStore[0].direction).toBe('out');
      expect(rowStore[0].status).toBe('planned');
      expect(rowStore[0].dueAt).toBe(dueAt);
      expect(rowStore[0].effectiveAt).toBeNull();
    });
  });

  describe('cancelPlannedEntry', () => {
    test('canceling a planned entry sets status to canceled', async () => {
      const planned = makeEntry({ id: 'planned-1', status: 'planned', direction: 'in' });
      const { db } = createMockDb([planned]);
      const { cancelPlannedEntry } = createCompanyCashOperations(db as never);
      const result = await cancelPlannedEntry('planned-1');
      expect(result.status).toBe('canceled');
      expect(result.entryId).toBe('planned-1');
    });

    test('throws when entry does not exist', async () => {
      const { db } = createMockDb([]);
      const { cancelPlannedEntry } = createCompanyCashOperations(db as never);
      await expect(cancelPlannedEntry('nonexistent')).rejects.toThrow('not found');
    });

    test('throws when entry is not planned', async () => {
      const posted = makeEntry({ id: 'posted-1', status: 'posted' });
      const { db } = createMockDb([posted]);
      const { cancelPlannedEntry } = createCompanyCashOperations(db as never);
      await expect(cancelPlannedEntry('posted-1')).rejects.toThrow('Only planned');
    });
  });

  describe('postPlannedEntry', () => {
    test('posting a planned entry sets status to posted and fills effectiveAt', async () => {
      const planned = makeEntry({ id: 'planned-2', status: 'planned', direction: 'in' });
      const { db } = createMockDb([planned]);
      const { postPlannedEntry } = createCompanyCashOperations(db as never);
      const result = await postPlannedEntry('planned-2');
      expect(result.status).toBe('posted');
      expect(result.entryId).toBe('planned-2');
      expect(typeof result.effectiveAt).toBe('number');
    });

    test('uses provided effectiveAt', async () => {
      const planned = makeEntry({ id: 'planned-3', status: 'planned' });
      const { db } = createMockDb([planned]);
      const { postPlannedEntry } = createCompanyCashOperations(db as never);
      const custom = 1_900_000_000_000;
      const result = await postPlannedEntry('planned-3', { effectiveAt: custom });
      expect(result.effectiveAt).toBe(custom);
    });

    test('throws when entry does not exist', async () => {
      const { db } = createMockDb([]);
      const { postPlannedEntry } = createCompanyCashOperations(db as never);
      await expect(postPlannedEntry('nonexistent')).rejects.toThrow('not found');
    });

    test('throws when entry is not planned', async () => {
      const posted = makeEntry({ id: 'posted-2', status: 'posted' });
      const { db } = createMockDb([posted]);
      const { postPlannedEntry } = createCompanyCashOperations(db as never);
      await expect(postPlannedEntry('posted-2')).rejects.toThrow('Only planned');
    });
  });
});
