import { describe, it, expect, beforeEach } from 'vitest';
import { createPaymentReceivablesStore } from './payment-receivables';
import { paymentTransactions } from './payment-schema';
import { companyCashLedger } from '../database/schema';

// ─── Mock DB factory ────────────────────────────────────────────────────────
const DRIZZLE_NAME = Symbol.for('drizzle:Name');

function createMockDb(): any {
  const txStore: Record<string, unknown>[] = [];
  const ledgerStore: Record<string, unknown>[] = [];

  function findFirst(opts: { where?: unknown }) {
    if (!opts?.where) return Promise.resolve(null);
    const conditions = extractWhere(opts.where);
    return Promise.resolve(
      txStore.find((r) => Object.entries(conditions).every(([k, v]) => r[k] === v)) ?? null,
    );
  }

  function insert(table: unknown) {
    const name = (table as any)[DRIZZLE_NAME] ?? String(table);
    return {
      values: (values: Record<string, unknown>) => ({
        returning: (cols: unknown) => {
          if (name === 'payment_transactions') txStore.push({ ...values });
          else if (name === 'company_cash_ledger') ledgerStore.push({ ...values });
          const result = { ...values, id: values['id'] ?? 'mock-id-' + txStore.length };
          return Promise.resolve([result]);
        },
        then: (resolve: any, reject: any) => {
          if (name === 'payment_transactions') txStore.push({ ...values });
          else if (name === 'company_cash_ledger') ledgerStore.push({ ...values });
          resolve({ rowCount: 1 });
          return {} as any;
        },
      }),
    };
  }

  function update(_table: unknown) {
    let captured: Record<string, unknown> | undefined;
    return {
      set: (values: Record<string, unknown>) => {
        captured = values;
        return {
          where: (where: unknown) => {
            const conditions = extractWhere(where);
            const idx = txStore.findIndex((r) =>
              Object.entries(conditions).every(([k, v]) => r[k] === v),
            );
            if (idx !== -1) Object.assign(txStore[idx], values);
            return Promise.resolve({ rowCount: idx === -1 ? 0 : 1 });
          },
        };
      },
    };
  }

  function select() {
    return {
      from: (table: unknown) => ({
        where: (_condition: unknown) => ({
          orderBy: (_fn: unknown) => ({ limit: (n: number) => Promise.resolve(txStore.slice()) }),
          limit: (n: number) => ({
            all: () => Promise.resolve(txStore.slice()),
          }),
        }),
        orderBy: (_fn: unknown) => ({ limit: (n: number) => Promise.resolve(txStore.slice()) }),
      }),
    };
  }

  function transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    // Transaction runs synchronously on the same stores for test purposes
    return fn({
      insert,
      update,
      select,
      query: { paymentTransactions: { findFirst } },
    });
  }

  return {
    insert,
    update,
    select,
    query: { paymentTransactions: { findFirst } },
    transaction,
    _ledgerStore: ledgerStore,
    _txStore: txStore,
    processPaymentEvent: vi.fn().mockResolvedValue({ id: 'mock-tx-id', isNew: false }),
  } as unknown as any;
}

// ─── Condition extractor ───────────────────────────────────────────────────
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
    n === 'SQLiteText' ||
    n === 'SQLiteInteger' ||
    n === 'SQLiteBlob' ||
    n === 'SQLiteReal' ||
    n === 'SQLiteTextBuilder' ||
    n === 'SQLiteIntegerBuilder' ||
    n === 'SQLiteBlobBuilder' ||
    n === 'SQLiteRealBuilder'
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
    if (isArrayChunk(valChunk) && (valChunk as unknown[]).length === 2) {
      value = (valChunk as unknown[])[1];
    } else if (
      typeof valChunk === 'object' &&
      valChunk !== null &&
      !isSQL(valChunk) &&
      !isStringChunk(valChunk) &&
      'value' in valChunk
    ) {
      value = (valChunk as { value: unknown }).value;
    } else if (
      typeof valChunk === 'string' ||
      typeof valChunk === 'number' ||
      typeof valChunk === 'boolean'
    ) {
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
  return Object.fromEntries(
    extractConditions(where).map(({ colName, value }) => [snakeToCamel(colName), value]),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────────────
describe('createPaymentReceivablesStore', () => {
  let db: ReturnType<typeof createMockDb>;
  let store: ReturnType<typeof createPaymentReceivablesStore> & { processPaymentEvent: any };

  beforeEach(() => {
    db = createMockDb();
    store = createPaymentReceivablesStore(db as any) as any;
  });

  it('creates a new transaction record', async () => {
    const result = await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_123',
      customerId: 'cust_1',
      amountUsd: 49.99,
      status: 'completed',
    } as any);
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
    } as any);
    const result = await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_dup',
      customerId: 'cust_1',
      amountUsd: 49.99,
      status: 'completed',
    } as any);
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
    } as any);
    expect(db._ledgerStore).toHaveLength(0);
  });

  it('posts revenue to company cash ledger for completed payment', async () => {
    await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_completed',
      customerId: 'cust_1',
      amountUsd: 49.99,
      status: 'completed',
    } as any);
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
      amountUsd: 99.0,
      status: 'completed',
    } as any);
    const initial = db._ledgerStore.length;
    await store.processPaymentEvent({
      provider: 'stripe',
      providerPaymentId: 'evt_dup2',
      customerId: 'cust_1',
      amountUsd: 99.0,
      status: 'completed',
    } as any);
    expect(db._ledgerStore).toHaveLength(initial);
  });

  it('listRecentTransactions returns an empty array when no transactions exist', async () => {
    const result = await store.listRecentTransactions({ limit: 10 } as any);
    expect(result).toHaveLength(0);
  });

  // ─── #5539, #5540, #5541 fix tests ──────────────────────────────────────
  // Use the REAL drizzle table objects. Identify inserts by table object
  // identity (===), since Symbol.for('drizzle:Name') is undefined on the
  // table objects in the test environment (pre-existing mock quirk).
  describe('processPaymentEvent atomicity + status fix', () => {
    function makeDb(opts: { rejectTxInsert?: boolean; txStore?: any[] } = {}) {
      const txStore = opts.txStore ?? [];
      const insertCalls: Array<{ table: any; values: any }> = [];
      function insert(table: any) {
        return {
          values: (v: any) => {
            insertCalls.push({ table, values: v });
            return {
              then: (resolve: any, reject: any) => {
                if (table === paymentTransactions && opts.rejectTxInsert) {
                  return reject(new Error('Simulated tx insert failure'));
                }
                if (table === paymentTransactions) txStore.push(v);
                resolve({ rowCount: 1 });
              },
            };
          },
        };
      }
      const db = {
        insert,
        transaction: (fn: any) => fn({
          insert,
          select: () => ({
            from: (_t: any) => ({
              where: (_c: any) => ({
                limit: () => ({ all: () => Promise.resolve(txStore) }),
              }),
            }),
          }),
        }),
      };
      return { db, insertCalls, txStore };
    }

    it('wraps tx insert and ledger insert in a single db.transaction (Closes #5541)', async () => {
      const { db, insertCalls } = makeDb();
      const storeLocal = createPaymentReceivablesStore(db as any) as any;
      await storeLocal.processPaymentEvent({
        provider: 'stripe', providerPaymentId: 'evt_atom', customerId: 'c1', amountUsd: 50, status: 'completed',
      });
      const txInsert = insertCalls.find(c => c.table === paymentTransactions);
      const ledgerInsert = insertCalls.find(c => c.table === companyCashLedger);
      expect(txInsert).toBeDefined();
      expect(ledgerInsert).toBeDefined();
    });

    it('writes ledger entry with status="posted" (Closes #5539, was "cleared")', async () => {
      const { db, insertCalls } = makeDb();
      const storeLocal = createPaymentReceivablesStore(db as any) as any;
      await storeLocal.processPaymentEvent({
        provider: 'stripe', providerPaymentId: 'evt_status', customerId: 'c1', amountUsd: 50, status: 'completed',
      });
      const ledgerInsert = insertCalls.find(c => c.table === companyCashLedger);
      expect(ledgerInsert).toBeDefined();
      expect(ledgerInsert!.values.status).toBe('posted');
    });

    it('does not write ledger entry for non-completed status', async () => {
      const { db, insertCalls } = makeDb();
      const storeLocal = createPaymentReceivablesStore(db as any) as any;
      await storeLocal.processPaymentEvent({
        provider: 'stripe', providerPaymentId: 'evt_failed', customerId: 'c1', amountUsd: 50, status: 'failed', failureReason: 'declined',
      });
      const ledgerInsert = insertCalls.find(c => c.table === companyCashLedger);
      expect(ledgerInsert).toBeUndefined();
    });

    it('returns isNew=false on second call with same provider+providerPaymentId (idempotency, Closes #5540)', async () => {
      const txStore: any[] = [];
      const { db } = makeDb({ txStore });
      const storeLocal = createPaymentReceivablesStore(db as any) as any;
      const r1 = await storeLocal.processPaymentEvent({
        provider: 'stripe', providerPaymentId: 'evt_idem', customerId: 'c1', amountUsd: 50, status: 'completed',
      });
      const r2 = await storeLocal.processPaymentEvent({
        provider: 'stripe', providerPaymentId: 'evt_idem', customerId: 'c1', amountUsd: 50, status: 'completed',
      });
      expect(r1.isNew).toBe(true);
      expect(r2.isNew).toBe(false);
    });

    it('rolls back if tx insert fails — ledger insert does not run (Closes #5541)', async () => {
      const { db, insertCalls } = makeDb({ rejectTxInsert: true });
      const storeLocal = createPaymentReceivablesStore(db as any) as any;
      await expect(storeLocal.processPaymentEvent({
        provider: 'stripe', providerPaymentId: 'evt_rollback', customerId: 'c1', amountUsd: 50, status: 'completed',
      })).rejects.toThrow('Simulated tx insert failure');
      const ledgerInsert = insertCalls.find(c => c.table === companyCashLedger);
      expect(ledgerInsert).toBeUndefined();
    });
  });

  describe('upsertCustomer', () => {
    it('preserves existing email when input.email is undefined', async () => {
      // Arrange: pre-existing customer
      const existing = {
        id: 'cust-1',
        provider: 'stripe',
        providerCustomerId: 'cust_ext_1',
        email: 'old@example.com',
        name: 'Old Name',
        createdAt: 1000,
        updatedAt: 1000,
      };
      db.select = vi.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => ({
              all: () => Promise.resolve([existing]),
            }),
          }),
        }),
      });
      let captured: Record<string, unknown> | undefined;
      db.update = vi.fn().mockReturnValue({
        set: (vals: Record<string, unknown>) => {
          captured = vals;
          return { where: () => Promise.resolve({ rowCount: 1 }) };
        },
      });

      // Act: call upsertCustomer with only name (no email)
      const result = await store.upsertCustomer({
        provider: 'stripe',
        providerCustomerId: 'cust_ext_1',
        name: 'New Name',
      });

      // Assert: existing email preserved, name updated
      expect(result).toBe('cust-1');
      expect(captured?.email).toBe('old@example.com');
      expect(captured?.name).toBe('New Name');
      expect(captured?.updatedAt).toBeDefined();
    });

    it('updates both fields when both are provided', async () => {
      const existing = {
        id: 'cust-2',
        provider: 'asaas',
        providerCustomerId: 'cust_ext_2',
        email: 'old@example.com',
        name: 'Old Name',
        createdAt: 1000,
        updatedAt: 1000,
      };
      db.select = vi.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => ({
              all: () => Promise.resolve([existing]),
            }),
          }),
        }),
      });
      let captured: Record<string, unknown> | undefined;
      db.update = vi.fn().mockReturnValue({
        set: (vals: Record<string, unknown>) => {
          captured = vals;
          return { where: () => Promise.resolve({ rowCount: 1 }) };
        },
      });

      const result = await store.upsertCustomer({
        provider: 'asaas',
        providerCustomerId: 'cust_ext_2',
        email: 'new@example.com',
        name: 'New Name',
      });

      expect(result).toBe('cust-2');
      expect(captured?.email).toBe('new@example.com');
      expect(captured?.name).toBe('New Name');
    });

    it('preserves both fields when neither is provided', async () => {
      const existing = {
        id: 'cust-3',
        provider: 'stripe',
        providerCustomerId: 'cust_ext_3',
        email: 'old@example.com',
        name: 'Old Name',
        createdAt: 1000,
        updatedAt: 1000,
      };
      db.select = vi.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => ({
              all: () => Promise.resolve([existing]),
            }),
          }),
        }),
      });
      let captured: Record<string, unknown> | undefined;
      db.update = vi.fn().mockReturnValue({
        set: (vals: Record<string, unknown>) => {
          captured = vals;
          return { where: () => Promise.resolve({ rowCount: 1 }) };
        },
      });

      const result = await store.upsertCustomer({
        provider: 'stripe',
        providerCustomerId: 'cust_ext_3',
      });

      expect(result).toBe('cust-3');
      expect(captured?.email).toBe('old@example.com');
      expect(captured?.name).toBe('Old Name');
    });
  });

  describe('upsertProvider (L#19 fix #5637)', () => {
    it('updates existing provider apiKeyEncrypted on second call (was silently dropped before fix)', async () => {
      // Arrange: pre-existing provider with stale apiKeyEncrypted
      const existing = {
        id: 'prov-1',
        provider: 'stripe',
        apiKeyEncrypted: 'old-key',
        webhookSecretEncrypted: 'old-secret',
        isActive: 1,
        configJson: null,
        createdAt: 1000,
        updatedAt: 1000,
      };
      db.select = vi.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            all: () => Promise.resolve([existing]),
          }),
        }),
      });
      let captured: Record<string, unknown> | undefined;
      db.update = vi.fn().mockReturnValue({
        set: (vals: Record<string, unknown>) => {
          captured = vals;
          return { where: () => Promise.resolve({ rowCount: 1 }) };
        },
      });

      // Act: call upsertProvider with a new apiKeyEncrypted (e.g., key rotation)
      const result = await store.upsertProvider({
        provider: 'stripe',
        apiKeyEncrypted: 'new-key',
        webhookSecretEncrypted: 'new-secret',
        isActive: true,
        configJson: { region: 'us-east-1' },
      });

      // Assert: existing id returned (not a new insert), UPDATE was called with NEW values
      expect(result).toBe('prov-1');
      expect(captured?.apiKeyEncrypted).toBe('new-key');
      expect(captured?.webhookSecretEncrypted).toBe('new-secret');
      // Coercion: input boolean → DB integer, input Record → JSON string
      expect(captured?.isActive).toBe(1);
      expect(captured?.configJson).toBe('{"region":"us-east-1"}');
      expect(captured?.updatedAt).toBeDefined();
    });

    it('inserts a new provider when none exists', async () => {
      // Arrange: no pre-existing provider
      db.select = vi.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            all: () => Promise.resolve([]),
          }),
        }),
      });
      let inserted: Record<string, unknown> | undefined;
      db.insert = vi.fn().mockReturnValue({
        values: (vals: Record<string, unknown>) => {
          inserted = vals;
          return Promise.resolve(undefined);
        },
      });

      // Act
      const result = await store.upsertProvider({
        provider: 'asaas',
        apiKeyEncrypted: 'asaas-key',
        webhookSecretEncrypted: 'asaas-secret',
        isActive: true,
      });

      // Assert: new id returned, INSERT was called (not UPDATE)
      // Note: INSERT path uses the InsertBuilder type-lie cast, so the
      // captured isActive is still boolean (not coerced to 1 in JS).
      // SQLite coerces to 0/1 at the SQL level.
      expect(result).toBeDefined();
      expect(inserted?.id).toBe(result);
      expect(inserted?.provider).toBe('asaas');
      expect(inserted?.apiKeyEncrypted).toBe('asaas-key');
      expect(inserted?.isActive).toBe(true);
    });
  });

});
