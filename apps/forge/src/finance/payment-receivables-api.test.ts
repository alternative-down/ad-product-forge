import { describe, it, expect, beforeEach } from 'vitest';
import { createPaymentReceivablesStore } from './payment-receivables';

// ─── Minimal mock DB factory ─────────────────────────────────────────────────
const DRIZZLE_NAME = Symbol.for('drizzle:Name');

function createMockDb() {
  const txStore: Record<string, unknown>[] = [];
  const ledgerStore: Record<string, unknown>[] = [];

  function insert(table: unknown) {
    const name = (table as any)[DRIZZLE_NAME] ?? String(table);
    return {
      values: (values: Record<string, unknown>) => {
        return {
          returning: (_cols: Record<string, unknown>) => {
            const stored = name === 'company_cash_ledger' ? ledgerStore : txStore;
            const generatedId = 'mock-id-' + Math.random().toString(36).slice(2, 8);
            const record: Record<string, unknown> = { ...values, id: generatedId };
            stored.push(record);
            return Promise.resolve([record]);
          },
        };
      },
    };
  }

  function update(_table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (where: unknown) => {
          const conditions = extractWhere(where);
          const idx = txStore.findIndex((r) =>
            Object.entries(conditions).every(([k, v]) => r[k] === v),
          );
          if (idx !== -1) Object.assign(txStore[idx], values);
          return Promise.resolve({ rowCount: idx === -1 ? 0 : 1 });
        },
      }),
    };
  }

  function select() {
    return {
      from: (_table: unknown) => {
        return {
          where: (where: unknown) => {
            const conditions = extractWhere(where);
            const filtered = txStore.filter((r) =>
              Object.entries(conditions).every(([k, v]) => r[k] === v),
            );
            return {
              limit: (_n: number) => ({
                all: () => Promise.resolve(filtered.slice()),
              }),
            };
          },
          limit: (n: number) => ({ all: () => Promise.resolve(txStore.slice(0, n)) }),
        };
      },
    };
  }

  function transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn({
      insert,
      update,
      select,
      query: { paymentTransactions: { findFirst: () => Promise.resolve(null) } },
    });
  }

  return {
    insert,
    update,
    select,
    query: { paymentTransactions: { findFirst: () => Promise.resolve(null) } },
    transaction,
    _ledgerStore: ledgerStore,
    _txStore: txStore,
  } as unknown as any;
}

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
    if (
      isSQL(chunk) &&
      (chunk as { queryChunks?: unknown[] }).queryChunks?.length &&
      !isColumn(chunk)
    ) {
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
  return s.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
}
function extractWhere(where: unknown): Record<string, unknown> {
  if (!where) return {};
  return Object.fromEntries(
    extractConditions(where).map(({ colName, value }) => [snakeToCamel(colName), value]),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('upsertCustomer', () => {
  let db: ReturnType<typeof createMockDb>;
  let store: ReturnType<typeof createPaymentReceivablesStore>;

  beforeEach(() => {
    db = createMockDb();
    store = createPaymentReceivablesStore(db as any) as any;
  });

  it('inserts a new customer when none exists', async () => {
    const id = await store.upsertCustomer({
      provider: 'stripe',
      providerCustomerId: 'cust_new',
      email: 'test@example.com',
      name: 'Test Customer',
    });
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    const stored = db._txStore.find((r: any) => r.providerCustomerId === 'cust_new');
    expect(stored).toBeDefined();
    expect(stored.email).toBe('test@example.com');
    expect(stored.name).toBe('Test Customer');
    expect(stored.provider).toBe('stripe');
    expect(stored.createdAt).toBeDefined();
    expect(stored.updatedAt).toBeDefined();
  });

  it('updates an existing customer when providerCustomerId matches', async () => {
    db._txStore.push({
      id: 'existing-cust-id',
      provider: 'stripe',
      providerCustomerId: 'cust_existing',
      email: 'old@example.com',
      name: 'Old Name',
      createdAt: 1000,
      updatedAt: 1000,
    });
    const id = await store.upsertCustomer({
      provider: 'stripe',
      providerCustomerId: 'cust_existing',
      email: 'new@example.com',
      name: 'New Name',
    });
    expect(id).toBe('existing-cust-id');
    const updated = db._txStore.find((r: any) => r.id === 'existing-cust-id');
    expect(updated.email).toBe('new@example.com');
    expect(updated.name).toBe('New Name');
    expect(updated.updatedAt).toBeGreaterThan(1000);
  });

  it('inserts with null email and name when not provided', async () => {
    const id = await store.upsertCustomer({
      provider: 'stripe',
      providerCustomerId: 'cust_noemail',
    });
    expect(id).toBeDefined();
    const stored = db._txStore.find((r: any) => r.providerCustomerId === 'cust_noemail');
    expect(stored).toBeDefined();
    expect(stored.email).toBeNull();
    expect(stored.name).toBeNull();
  });
});

describe('upsertSubscription', () => {
  let db: ReturnType<typeof createMockDb>;
  let store: ReturnType<typeof createPaymentReceivablesStore>;

  beforeEach(() => {
    db = createMockDb();
    store = createPaymentReceivablesStore(db as any) as any;
  });

  const validInput = {
    customerId: 'cust_1',
    productId: 'prod_1',
    provider: 'stripe' as const,
    providerSubscriptionId: 'sub_new',
    status: 'active' as const,
    amountUsd: 49.99,
    currency: 'usd' as const, // #6013 L#NN-50 #23 N=4 — required since currency tracking fix
    billingCycle: 'monthly' as const,
    currentPeriodStart: 1000,
    currentPeriodEnd: 2000,
  };

  it('inserts a new subscription when none exists', async () => {
    const id = await store.upsertSubscription(validInput);
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    const stored = db._txStore.find((r: any) => r.providerSubscriptionId === 'sub_new');
    expect(stored).toBeDefined();
    expect(stored.customerId).toBe('cust_1');
    expect(stored.productId).toBe('prod_1');
    expect(stored.provider).toBe('stripe');
    expect(stored.status).toBe('active');
    expect(stored.amountUsd).toBe(49.99);
    expect(stored.billingCycle).toBe('monthly');
    expect(stored.currentPeriodStart).toBe(1000);
    expect(stored.currentPeriodEnd).toBe(2000);
    expect(stored.createdAt).toBeDefined();
    expect(stored.updatedAt).toBeDefined();
  });

  it('updates an existing subscription when providerSubscriptionId matches', async () => {
    db._txStore.push({
      id: 'existing-sub-id',
      customerId: 'cust_1',
      productId: 'prod_1',
      provider: 'stripe',
      providerSubscriptionId: 'sub_existing',
      status: 'active',
      amountUsd: 9.99,
      billingCycle: 'monthly',
      currentPeriodStart: null as unknown,
      currentPeriodEnd: null as unknown,
      canceledAt: null as unknown,
      createdAt: 1000,
      updatedAt: 1000,
    });
    const id = await store.upsertSubscription({
      ...validInput,
      providerSubscriptionId: 'sub_existing',
      status: 'cancelled' as const,
      amountUsd: 9.99,
    });
    expect(id).toBe('existing-sub-id');
    const updated = db._txStore.find((r: any) => r.id === 'existing-sub-id');
    expect(updated.status).toBe('cancelled');
    expect(updated.updatedAt).toBeGreaterThan(1000);
  });

  it('inserts with optional fields as null when not provided', async () => {
    const id = await store.upsertSubscription({
      customerId: 'cust_1',
      productId: 'prod_1',
      provider: 'stripe' as const,
      providerSubscriptionId: 'sub_minimal',
      status: 'trialing' as const,
      amountUsd: 0,
      currency: 'usd' as const,
      billingCycle: 'monthly' as const,
    });
    expect(id).toBeDefined();
    const stored = db._txStore.find((r: any) => r.providerSubscriptionId === 'sub_minimal');
    expect(stored).toBeDefined();
    expect(stored.currentPeriodStart).toBeNull();
    expect(stored.currentPeriodEnd).toBeNull();
    expect(stored.canceledAt).toBeNull();
  });
});

describe('getProvider', () => {
  let db: ReturnType<typeof createMockDb>;
  let store: ReturnType<typeof createPaymentReceivablesStore>;

  beforeEach(() => {
    db = createMockDb();
    store = createPaymentReceivablesStore(db as any) as any;
  });

  it('returns null when no provider exists', async () => {
    const result = await store.getProvider('stripe');
    expect(result).toBeNull();
  });

  it('returns the provider record', async () => {
    db._txStore.push({
      id: 'prov_id',
      provider: 'stripe',
      apiKeyEncrypted: 'secret',
      webhookSecretEncrypted: null,
      isActive: true,
      configJson: null,
      createdAt: 1000,
      updatedAt: 1000,
    });
    const result = await store.getProvider('stripe');
    expect(result).toBeDefined();
    expect(result?.provider).toBe('stripe');
    expect(result?.apiKeyEncrypted).toBe('secret');
  });
});
