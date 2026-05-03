import { describe, it, expect, beforeEach } from 'vitest';
import { createPaymentReceivablesStore } from './payment-receivables';

// ─── Mock DB factory ────────────────────────────────────────────────────────
const DRIZZLE_NAME = Symbol.for('drizzle:Name');

function createMockDb() {
  const txStore: Record<string, unknown>[] = [];
  const ledgerStore: Record<string, unknown>[] = [];

  function findFirst(opts: { where?: unknown }) {
    if (!opts?.where) return Promise.resolve(null);
    const conditions = extractWhere(opts.where);
    return Promise.resolve(txStore.find((r) =>
      Object.entries(conditions).every(([k, v]) => r[k] === v),
    ) ?? null);
  }

  function insert(table: unknown) {
    const name = table[DRIZZLE_NAME] ?? String(table);
    return {
      values: (values: Record<string, unknown>) => {
        if (name === 'payment_transactions') txStore.push({ ...values });
        else if (name === 'company_cash_ledger') ledgerStore.push({ ...values });
        return Promise.resolve({ rowCount: 1 });
      },
    };
  }

  function update(_table: unknown) {
    let captured: Record<string, unknown> | undefined;
    return {
      set: (values: Record<string, unknown>) => ({
        where: (where: unknown) => {
          const conditions = extractWhere(where);
          const idx = txStore.findIndex((r) =>
            Object.entries(conditions).every(([k, v]) => r[k] === v),
          );
          if (idx !== -1) Object.assign(txStore[idx], captured);
          return Promise.resolve({ rowCount: idx === -1 ? 0 : 1 });
        },
      }),
    };
  }

  function select() {
    return {
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(txStore.slice()) }),
        orderBy: () => ({ limit: () => Promise.resolve(txStore.slice()) }),
      }),
    };
  }

  return {
    insert,
    update,
    select,
    query: { paymentTransactions: { findFirst } },
    _ledgerStore: ledgerStore,
    _txStore: txStore,
  } as {
    insert: (table: unknown) => { values: (v: unknown) => Promise<{ rowCount: number }> };
    update: (table: unknown) => { set: (v: Record<string, unknown>) => { where: (w: unknown) => Promise<{ rowCount: number }> } };
    select: () => { from: () => { where: (w: unknown) => { limit: (n: number) => Promise<Record<string, unknown>[]> }; orderBy: () => { limit: (n: number) => Promise<Record<string, unknown>[]> } } };
    query: { paymentTransactions: { findFirst: (opts: { where?: unknown }) => Promise<Record<string, unknown> | null> } };
    _ledgerStore: Record<string, unknown>[];
    _txStore: Record<string, unknown>[];
  };
}

// ─── Condition extractor ───────────────────────────────────────────────────
function isSQL(x: unknown): x is { queryChunks: unknown[] } {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && 'queryChunks' in x;
}
function isStringChunk(x: unknown): boolean {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && 'value' in x && Array.isArray((x as { value: unknown }).value);
}
function isArrayChunk(x: unknown): boolean { return Array.isArray(x); }
function isColumn(x: unknown): boolean {
  const n = (x as { constructor?: { name?: string } })?.constructor?.name;
  return n === 'SQLiteText' || n === 'SQLiteInteger' || n === 'SQLiteBlob' || n === 'SQLiteReal' ||
    n === 'SQLiteTextBuilder' || n === 'SQLiteIntegerBuilder' || n === 'SQLiteBlobBuilder' || n === 'SQLiteRealBuilder';
}
function extractConditions(sql: unknown): Array<{ colName: string; value: unknown }> {
  if (!isSQL(sql)) return [];
  const result: Array<{ colName: string; value: unknown }> = [];
  const chunks = sql.queryChunks ?? [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (isStringChunk(chunk)) continue;
    if (isSQL(chunk) && chunk.queryChunks?.length && !isColumn(chunk)) { result.push(...extractConditions(chunk)); continue; }
    if (!isColumn(chunk)) continue;
    const colName = (chunk as { config?: { name?: string } }).config?.name;
    if (!colName) continue;
    let j = i + 1;
    while (j < chunks.length && isStringChunk(chunks[j])) j++;
    if (j >= chunks.length) break;
    const valChunk = chunks[j];
    let value: unknown;
    if (isArrayChunk(valChunk) && (valChunk as unknown[]).length === 2) { value = (valChunk as unknown[])[1]; }
    else if (typeof valChunk === 'object' && valChunk !== null && !isSQL(valChunk) && !isStringChunk(valChunk) && 'value' in valChunk) { value = (valChunk as { value: unknown }).value; }
    else if (typeof valChunk === 'string' || typeof valChunk === 'number' || typeof valChunk === 'boolean') { value = valChunk; }
    else { i = j; continue; }
    result.push({ colName, value });
    i = j;
  }
  return result;
}
function snakeToCamel(s: string): string { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
function extractWhere(where: unknown): Record<string, unknown> {
  if (!where) return {};
  return Object.fromEntries(extractConditions(where).map(({ colName, value }) => [snakeToCamel(colName), value]));
}

// ─── Tests ────────────────────────────────────────────────────────────────────────────
describe('createPaymentReceivablesStore', () => {
  let db: ReturnType<typeof createMockDb>;
  let store: ReturnType<typeof createPaymentReceivablesStore>;

  beforeEach(() => {
    db = createMockDb();
    store = createPaymentReceivablesStore(db as never);
  });

  it('creates a new transaction record', async () => {
    const result = await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_123',
      customerId: 'cust_1',
      amountUsd: 49.99,
      status: 'completed',
    });
    expect(result.id).toBeDefined();
    expect(result.isNew).toBe(true);
  });

  it('returns isNew: false for a duplicate providerPaymentId', async () => {
    await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_dup',
      customerId: 'cust_1',
      amountUsd: 49.99,
      status: 'completed',
    });
    const result = await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_dup',
      customerId: 'cust_1',
      amountUsd: 49.99,
      status: 'completed',
    });
    expect(result.isNew).toBe(false);
  });

  it('does NOT insert into company cash ledger for failed payments', async () => {
    await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_fail',
      customerId: 'cust_1',
      amountUsd: 49.99,
      status: 'failed',
      failureReason: 'card declined',
    });
    expect(db._ledgerStore).toHaveLength(0);
  });

  it('posts revenue to company cash ledger for completed payment', async () => {
    await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_completed',
      customerId: 'cust_1',
      amountUsd: 49.99,
      status: 'completed',
    });
    expect(db._ledgerStore).toHaveLength(1);
    const entry = db._ledgerStore[0];
    expect(entry.direction).toBe('in');
    expect(entry.amountUsd).toBe(49.99);
    expect(entry.type).toBe('payment_received');
  });

  it('does not post duplicate ledger entry for an idempotent duplicate', async () => {
    await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_dup2',
      customerId: 'cust_1',
      amountUsd: 99.00,
      status: 'completed',
    });
    const initial = db._ledgerStore.length;
    await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_dup2',
      customerId: 'cust_1',
      amountUsd: 99.00,
      status: 'completed',
    });
    expect(db._ledgerStore).toHaveLength(initial);
  });

  it('listRecentTransactions returns an empty array when no transactions exist', async () => {
    const result = await store.listRecentTransactions();
    expect(result).toHaveLength(0);
  });
});
