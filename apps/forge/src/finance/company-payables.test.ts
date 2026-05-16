import { describe, expect, test } from 'vitest';
import { createCompanyPayables } from './company-payables';
import type { Database } from '../database/client';

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
    let op = 'eq';
    if (
      typeof valChunk === 'object' &&
      valChunk !== null &&
      !isSQL(valChunk) &&
      !isStringChunk(valChunk) &&
      !Array.isArray(valChunk)
    ) {
      if ('value' in valChunk) {
        value = (valChunk as unknown as any).value;
      } else if ('op' in valChunk) {
        op = (valChunk as unknown as any).op ?? 'eq';
        value = (valChunk as unknown as any).value;
      }
    } else if (typeof valChunk === 'string' || typeof valChunk === 'number' || typeof valChunk === 'boolean') {
      value = valChunk;
    } else {
      i = j;
      continue;
    }
    result.push({ colName, value, op });
    i = j;
  }
  return result;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── Row types ─────────────────────────────────────────────────────────────────────

interface RecurringPayableRow {
  id: string;
  name: string;
  description?: string | null;
  amountUsd: number;
  recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
  nextDueAt: number;
  isActive: number;
  createdAt: number;
  updatedAt: number;
}

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

// ─── Mock DB factory ───────────────────────────────────────────────────────────

interface MockPayablesDb {
  query: {
    companyRecurringPayables: {
      findMany: (opts?: { orderBy?: unknown }) => Promise<RecurringPayableRow[]>;
      findFirst: (opts: { where?: unknown }) => Promise<RecurringPayableRow | null>;
    };
    companyCashLedger: {
      findMany: () => Promise<CashLedgerRow[]>;
      findFirst: (opts: { where?: unknown }) => Promise<CashLedgerRow | null>;
    };
  };
  insert: (table: unknown) => {
    values: (values: Partial<CashLedgerRow | RecurringPayableRow>) => Promise<{ rowCount: number }>;
  };
  update: (table: unknown) => {
    set: (values: Record<string, unknown>) => {
      where: (condition: unknown) => Promise<{ rowCount: number }>;
    };
  };
  transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
}

function createMockPayablesDb(
  initialPayables: RecurringPayableRow[] = [],
  initialLedger: CashLedgerRow[] = [],
): Database {
  const payablesStore: RecurringPayableRow[] = [...initialPayables];
  const ledgerStore: CashLedgerRow[] = [...initialLedger];

  function findFirstInLedger(opts: { where?: unknown }): CashLedgerRow | null {
    if (!opts.where) return ledgerStore[0] ?? null;
    const conds = extractConditions(opts.where);
    return ledgerStore.find((r: any) =>
      conds.every(({ colName, value, op }) => {
        const rv = (r as unknown as any)[snakeToCamel(colName)];
        if (op === 'gte') return (rv as number) >= (value as number);
        return rv === value;
      }),
    ) ?? null;
  }

  function findFirstInPayables(opts: { where?: unknown }): RecurringPayableRow | null {
    if (!opts.where) return payablesStore[0] ?? null;
    const conds = extractConditions(opts.where);
    return payablesStore.find((r: any) =>
      conds.every(({ colName, value }) => {
        const rv = (r as unknown as any)[snakeToCamel(colName)];
        return rv === value;
      }),
    ) ?? null;
  }

  return {
    query: {
      companyRecurringPayables: {
        findMany: async (opts: unknown) => {
          let rows = [...payablesStore];
          if ((opts as any)?.orderBy) rows = rows.sort((a: any, b: any) => a.name.localeCompare(b.name));
          return rows;
        },
        findFirst: async (opts: unknown) => findFirstInPayables(opts as any),
      },
      companyCashLedger: {
        findMany: async () => [...ledgerStore],
        findFirst: async (opts: unknown) => findFirstInLedger(opts as any),
      },
    },
    insert: () => ({
      values: async (values: unknown) => {
        if ('recurrencePeriod' in (values as any)) {
          payablesStore.push(values as unknown as any);
        } else {
          ledgerStore.push(values as any);
        }
        return { rowCount: 1 };
      },
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async (condition: unknown) => {
          const conds = extractConditions(condition);
          for (const row of payablesStore) {
            if (conds.every(({ colName, value }) => (row as unknown as any)[snakeToCamel(colName)] === value)) {
              Object.assign(row, values);
            }
          }
          return { rowCount: 1 };
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        insert: () => ({
          values: async (values: Record<string, unknown>) => {
            if ('recurrencePeriod' in values) {
              payablesStore.push(values as unknown as any);
            } else {
              ledgerStore.push(values as unknown as any);
            }
            return { rowCount: 1 };
          },
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: async (condition: unknown) => {
              const conds = extractConditions(condition);
              for (const row of payablesStore) {
                if (conds.every(({ colName, value }: { colName: string; value: unknown }) => (row as unknown as any)[snakeToCamel(colName)] === value)) {
                  Object.assign(row, values);
                }
              }
              return { rowCount: 1 };
            },
          }),
        }),
      });
    },
  } as unknown as Database;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createCompanyPayables', () => {
  describe('listRecurringPayables', () => {
    test('returns empty array when no payables exist', async () => {
      const db = createMockPayablesDb();
      const payables = createCompanyPayables(db);
      const result = await payables.listRecurringPayables();
      expect(result).toEqual([]);
    });

    test('returns payables sorted alphabetically by name', async () => {
      const db = createMockPayablesDb([
        { id: 'p2', name: 'B vendor', amountUsd: 200, recurrencePeriod: 'monthly', nextDueAt: 0, isActive: 1, createdAt: 0, updatedAt: 0 },
        { id: 'p1', name: 'A vendor', amountUsd: 100, recurrencePeriod: 'weekly', nextDueAt: 0, isActive: 1, createdAt: 0, updatedAt: 0 },
        { id: 'p3', name: 'C vendor', amountUsd: 300, recurrencePeriod: 'yearly', nextDueAt: 0, isActive: 0, createdAt: 0, updatedAt: 0 },
      ]);
      const payables = createCompanyPayables(db);
      const result = await payables.listRecurringPayables();
      expect(result.map((r: any) => r.name)).toEqual(['A vendor', 'B vendor', 'C vendor']);
    });

    test('maps isActive 1 to true, 0 to false', async () => {
      const db = createMockPayablesDb([
        { id: 'p1', name: 'Active', amountUsd: 100, recurrencePeriod: 'monthly', nextDueAt: 0, isActive: 1, createdAt: 0, updatedAt: 0 },
        { id: 'p2', name: 'Inactive', amountUsd: 100, recurrencePeriod: 'monthly', nextDueAt: 0, isActive: 0, createdAt: 0, updatedAt: 0 },
      ]);
      const payables = createCompanyPayables(db);
      const result = await payables.listRecurringPayables();
      expect(result.find((r: any) => r.name === 'Active')?.isActive).toBe(true);
      expect(result.find((r: any) => r.name === 'Inactive')?.isActive).toBe(false);
    });

    test('maps id to payableId and returns correct shape', async () => {
      const db = createMockPayablesDb([
        { id: 'pay-abc', name: 'Test', amountUsd: 500, recurrencePeriod: 'yearly', nextDueAt: 999, isActive: 1, createdAt: 0, updatedAt: 0 },
      ]);
      const payables = createCompanyPayables(db);
      const result = await payables.listRecurringPayables();
      expect(result[0]).toEqual({
        name: 'Test',
        amountUsd: 500,
        recurrencePeriod: 'yearly',
        nextDueAt: 999,
        payableId: 'pay-abc',
        description: undefined,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      });
    });

    test('maps description null to undefined', async () => {
      const db = createMockPayablesDb([
        { id: 'p1', name: 'Test', description: null, amountUsd: 100, recurrencePeriod: 'monthly', nextDueAt: 0, isActive: 1, createdAt: 0, updatedAt: 0 },
      ]);
      const payables = createCompanyPayables(db);
      const result = await payables.listRecurringPayables();
      expect(result[0].description).toBeUndefined();
    });

    test('maps description string to string', async () => {
      const db = createMockPayablesDb([
        { id: 'p1', name: 'Test', description: 'Monthly rent', amountUsd: 100, recurrencePeriod: 'monthly', nextDueAt: 0, isActive: 1, createdAt: 0, updatedAt: 0 },
      ]);
      const payables = createCompanyPayables(db);
      const result = await payables.listRecurringPayables();
      expect(result[0].description).toBe('Monthly rent');
    });
  });

  describe('createRecurringPayable', () => {
    test('creates payable and first planned occurrence, returns both ids', async () => {
      const db = createMockPayablesDb();
      const payables = createCompanyPayables(db);
      const result = await payables.createRecurringPayable({
        name: 'Hosting',
        description: 'Monthly server cost',
        amountUsd: 49.99,
        recurrencePeriod: 'monthly',
        dueAt: 1700000000000,
      });

      expect(result.payableId).toBeDefined();
      expect(result.entryId).toBeDefined();
      expect(result.payableId).not.toBe(result.entryId);
    });

    test('sets isActive to 1 on the payable record', async () => {
      const db = createMockPayablesDb();
      const payables = createCompanyPayables(db);
      await payables.createRecurringPayable({
        name: 'Active Payable',
        amountUsd: 100,
        recurrencePeriod: 'weekly',
        dueAt: 1700000000000,
      });

      const stored = await db.query.companyRecurringPayables.findMany({});
      expect(stored[0].isActive).toBe(1);
    });

    test('first planned occurrence has correct ledger shape', async () => {
      const db = createMockPayablesDb();
      const payables = createCompanyPayables(db);
      const result = await payables.createRecurringPayable({
        name: 'Rent',
        description: 'Office rent',
        amountUsd: 1500,
        recurrencePeriod: 'monthly',
        dueAt: 1700000000000,
      });

      const entry = await db.query.companyCashLedger.findFirst({ where: undefined as any });
      expect(entry?.id).toBe(result.entryId);
      expect(entry?.referenceId).toBe(result.payableId);
      expect(entry?.status).toBe('planned');
      expect(entry?.direction).toBe('out');
      expect(entry?.type).toBe('recurring-payable');
      expect(entry?.referenceType).toBe('recurring-payable');
      expect(entry?.amountUsd).toBe(1500);
      expect(entry?.dueAt).toBe(1700000000000);
      expect(entry?.effectiveAt).toBeNull();
    });

    test('description defaults to name when not provided', async () => {
      const db = createMockPayablesDb();
      const payables = createCompanyPayables(db);
      await payables.createRecurringPayable({
        name: 'Netflix',
        amountUsd: 15.99,
        recurrencePeriod: 'monthly',
        dueAt: 1700000000000,
      });

      const entry = await db.query.companyCashLedger.findFirst({ where: undefined as any });
      expect(entry?.description).toBe('Netflix');
    });
  });

  describe('setRecurringPayableActive', () => {
    test('sets isActive to true when called with true', async () => {
      const db = createMockPayablesDb([
        { id: 'p1', name: 'Test', amountUsd: 100, recurrencePeriod: 'monthly', nextDueAt: 0, isActive: 0, createdAt: 0, updatedAt: 0 },
      ]);
      const payables = createCompanyPayables(db);
      const result = await payables.setRecurringPayableActive('p1', true);
      expect(result.isActive).toBe(true);
    });

    test('sets isActive to false when called with false', async () => {
      const db = createMockPayablesDb([
        { id: 'p1', name: 'Test', amountUsd: 100, recurrencePeriod: 'monthly', nextDueAt: 0, isActive: 1, createdAt: 0, updatedAt: 0 },
      ]);
      const payables = createCompanyPayables(db);
      const result = await payables.setRecurringPayableActive('p1', false);
      expect(result.isActive).toBe(false);
    });

    test('updates updatedAt timestamp', async () => {
      const db = createMockPayablesDb([
        { id: 'p1', name: 'Test', amountUsd: 100, recurrencePeriod: 'monthly', nextDueAt: 0, isActive: 1, createdAt: 0, updatedAt: 0 },
      ]);
      const payables = createCompanyPayables(db);
      await payables.setRecurringPayableActive('p1', true);
      const row = await db.query.companyRecurringPayables.findFirst({ where: undefined as any });
      expect(row?.updatedAt).toBeGreaterThan(0);
    });

    test('throws when payable not found', async () => {
      const db = createMockPayablesDb();
      const payables = createCompanyPayables(db);
      await expect(payables.setRecurringPayableActive('nonexistent', true)).rejects.toThrow(
        'Recurring payable not found: nonexistent',
      );
    });
  });

  describe('syncRecurringPayableOccurrence', () => {
    test('returns null when entry not found', async () => {
      const db = createMockPayablesDb([], []);
      const payables = createCompanyPayables(db);
      const result = await payables.syncRecurringPayableOccurrence({ entryId: 'nonexistent' });
      expect(result).toBeNull();
    });

    test('returns null when entry has no referenceType', async () => {
      const db = createMockPayablesDb([], [
        { id: 'e1', type: 'one-time', direction: 'out', amountUsd: 100, status: 'planned', updatedAt: 0, createdAt: 0 },
      ]);
      const payables = createCompanyPayables(db);
      const result = await payables.syncRecurringPayableOccurrence({ entryId: 'e1' });
      expect(result).toBeNull();
    });

    test('returns null when payable is inactive', async () => {
      const db = createMockPayablesDb(
        [{ id: 'p1', name: 'Test', amountUsd: 100, recurrencePeriod: 'monthly', nextDueAt: 1700000000000, isActive: 0, createdAt: 0, updatedAt: 0 }],
        [{ id: 'e1', type: 'recurring-payable', direction: 'out', amountUsd: 100, referenceType: 'recurring-payable', referenceId: 'p1', status: 'planned', dueAt: 1700000000000, updatedAt: 0, createdAt: 0 }],
      );
      const payables = createCompanyPayables(db);
      const result = await payables.syncRecurringPayableOccurrence({ entryId: 'e1' });
      expect(result).toBeNull();
    });

    test('returns null when next occurrence already exists', async () => {
      const db = createMockPayablesDb(
        [{ id: 'p1', name: 'Test', amountUsd: 100, recurrencePeriod: 'weekly', nextDueAt: 1700000000000, isActive: 1, createdAt: 0, updatedAt: 0 }],
        [
          { id: 'e1', type: 'recurring-payable', direction: 'out', amountUsd: 100, referenceType: 'recurring-payable', referenceId: 'p1', status: 'planned', dueAt: 1700000000000, updatedAt: 0, createdAt: 0 },
          { id: 'e2', type: 'recurring-payable', direction: 'out', amountUsd: 100, referenceType: 'recurring-payable', referenceId: 'p1', status: 'planned', dueAt: 1700000000000 + 7 * 86400000, updatedAt: 0, createdAt: 0 },
        ],
      );
      const payables = createCompanyPayables(db);
      const result = await payables.syncRecurringPayableOccurrence({ entryId: 'e1' });
      expect(result).toBeNull();
    });

    test('creates next planned occurrence when none exists', async () => {
      const db = createMockPayablesDb(
        [{ id: 'p1', name: 'Test', amountUsd: 100, recurrencePeriod: 'monthly', nextDueAt: 1700000000000, isActive: 1, createdAt: 0, updatedAt: 0 }],
        [{ id: 'e1', type: 'recurring-payable', direction: 'out', amountUsd: 100, referenceType: 'recurring-payable', referenceId: 'p1', status: 'planned', dueAt: 1700000000000, updatedAt: 0, createdAt: 0 }],
      );
      const payables = createCompanyPayables(db);
      const result = await payables.syncRecurringPayableOccurrence({ entryId: 'e1' });

      expect(result).toBeDefined();
      const allLedger = await db.query.companyCashLedger.findMany();
      expect(allLedger.length).toBe(2);
    });

    test('updates payable nextDueAt to the advanced date', async () => {
      const db = createMockPayablesDb(
        [{ id: 'p1', name: 'Test', amountUsd: 100, recurrencePeriod: 'yearly', nextDueAt: 1700000000000, isActive: 1, createdAt: 0, updatedAt: 0 }],
        [{ id: 'e1', type: 'recurring-payable', direction: 'out', amountUsd: 100, referenceType: 'recurring-payable', referenceId: 'p1', status: 'planned', dueAt: 1700000000000, updatedAt: 0, createdAt: 0 }],
      );
      const payables = createCompanyPayables(db);
      await payables.syncRecurringPayableOccurrence({ entryId: 'e1' });

      const updated = await db.query.companyRecurringPayables.findFirst({ where: undefined as any });
      expect(updated?.nextDueAt).toBeGreaterThan(1700000000000);
    });
  });

  describe('advanceDueAt — weekly recurrence', () => {
    test('adds 7 days to the due date', async () => {
      const db = createMockPayablesDb(
        [{ id: 'p1', name: 'Weekly', amountUsd: 50, recurrencePeriod: 'weekly', nextDueAt: 1700000000000, isActive: 1, createdAt: 0, updatedAt: 0 }],
        [{ id: 'e1', type: 'recurring-payable', direction: 'out', amountUsd: 50, referenceType: 'recurring-payable', referenceId: 'p1', status: 'planned', dueAt: 1700000000000, updatedAt: 0, createdAt: 0 }],
      );
      const payables = createCompanyPayables(db);
      await payables.syncRecurringPayableOccurrence({ entryId: 'e1' });

      const payable = await db.query.companyRecurringPayables.findFirst({ where: undefined as any });
      const expectedAdvance = 7 * 86400000;
      expect(payable?.nextDueAt).toBe(1700000000000 + expectedAdvance);
    });
  });

  describe('advanceDueAt — monthly recurrence', () => {
    test('advances to next month', async () => {
      const db = createMockPayablesDb(
        [{ id: 'p1', name: 'Monthly', amountUsd: 50, recurrencePeriod: 'monthly', nextDueAt: 1700000000000, isActive: 1, createdAt: 0, updatedAt: 0 }],
        [{ id: 'e1', type: 'recurring-payable', direction: 'out', amountUsd: 50, referenceType: 'recurring-payable', referenceId: 'p1', status: 'planned', dueAt: 1700000000000, updatedAt: 0, createdAt: 0 }],
      );
      const payables = createCompanyPayables(db);
      await payables.syncRecurringPayableOccurrence({ entryId: 'e1' });

      const payable = await db.query.companyRecurringPayables.findFirst({ where: undefined as any });
      expect(payable?.nextDueAt).toBeGreaterThan(1700000000000);
    });
  });

  describe('advanceDueAt — yearly recurrence', () => {
    test('advances to next year', async () => {
      const db = createMockPayablesDb(
        [{ id: 'p1', name: 'Yearly', amountUsd: 50, recurrencePeriod: 'yearly', nextDueAt: 1700000000000, isActive: 1, createdAt: 0, updatedAt: 0 }],
        [{ id: 'e1', type: 'recurring-payable', direction: 'out', amountUsd: 50, referenceType: 'recurring-payable', referenceId: 'p1', status: 'planned', dueAt: 1700000000000, updatedAt: 0, createdAt: 0 }],
      );
      const payables = createCompanyPayables(db);
      await payables.syncRecurringPayableOccurrence({ entryId: 'e1' });

      const payable = await db.query.companyRecurringPayables.findFirst({ where: undefined as any });
      expect(payable?.nextDueAt).toBeGreaterThan(1700000000000 + 365 * 86400000);
    });
  });

  describe('advanceDueAt fallback', () => {
    test('uses payable nextDueAt when entry dueAt is undefined', async () => {
      const db = createMockPayablesDb(
        [{ id: 'p1', name: 'Test', amountUsd: 100, recurrencePeriod: 'weekly', nextDueAt: 1800000000000, isActive: 1, createdAt: 0, updatedAt: 0 }],
        [{ id: 'e1', type: 'recurring-payable', direction: 'out', amountUsd: 100, referenceType: 'recurring-payable', referenceId: 'p1', status: 'planned', dueAt: undefined, updatedAt: 0, createdAt: 0 }],
      );
      const payables = createCompanyPayables(db);
      await payables.syncRecurringPayableOccurrence({ entryId: 'e1' });

      const payable = await db.query.companyRecurringPayables.findFirst({ where: undefined as any });
      const expectedAdvance = 7 * 86400000;
      expect(payable?.nextDueAt).toBe(1800000000000 + expectedAdvance);
    });
  });
});
