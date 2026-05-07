/**
 * Unit tests for webhooks/store.ts.
 *
 * Mock strategy: fully simulate Drizzle's chainable query builder.
 * Key fact: in Drizzle, select().from().where().orderBy().limit()
 * all return the SAME query builder object. Awaiting it runs the query.
 *
 * We use a class (not a plain object) so that vi.fn() on each method
 * can track separate calls per test without interference.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createWebhookStore } from './store';
import type { Database } from '../database/schema';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

let idCounter = 0;
vi.mock('../utils/id', () => ({
  createId: vi.fn(() => `mock-id-${++idCounter}`),
}));

vi.mock('../database/schema', () => ({
  webhookRoutes: Symbol('webhookRoutes'),
  webhookEvents: Symbol('webhookEvents'),
}));

// A single shared query builder class — each call to .where()/.orderBy()/.limit()
// returns the SAME instance, matching Drizzle's behavior.
class QueryBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _result: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _error: any = null;

  setResult(result: unknown[]) { this._result = result; }
  setError(error: Error) { this._error = error; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limit = vi.fn().mockImplementation(() => this.#resolve());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orderBy = vi.fn().mockReturnValue(this);

  // Thenable so `await db.select().from().where()` works (listRoutes/listEvents path)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then = (onfulfilled?: (v: unknown[]) => unknown, onrejected?: (e: unknown) => unknown): Promise<unknown> => this.#resolve().then(onfulfilled, onrejected);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #resolve(): Promise<any[]> {
    if (this._error) return Promise.reject(this._error);
    return Promise.resolve(this._result);
  }
}

function createMockDb(overrides?: {
  insertError?: Error;
  updateError?: Error;
  selectResult?: unknown[];
  selectError?: Error;
}): Database {
  const { insertError, updateError, selectResult = [], selectError } = overrides ?? {};

  // Each createMockDb call gets a fresh QueryBuilder
  const qb = new QueryBuilder();
  qb.setResult(selectResult);
  if (selectError) qb.setError(selectError);

  const db = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation(() => {
        if (insertError) throw insertError;
        return Promise.resolve(undefined);
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          if (updateError) throw updateError;
          return Promise.resolve(undefined);
        }),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(qb),
      }),
    }),
  };

  return db as unknown as Database;
}

beforeEach(() => { idCounter = 0; });

// ─── createRoute ─────────────────────────────────────────────────────────────

describe('createWebhookStore — createRoute', () => {
  it('creates route with required fields', async () => {
    const store = createWebhookStore(createMockDb());
    const result = await store.createRoute({ agentId: 'agent-1', name: 'GitHub' });
    expect(result.agentId).toBe('agent-1');
    expect(result.name).toBe('GitHub');
    expect(result.isActive).toBe(true);
    expect(result.routeId).toBe('mock-id-1');
  });

  it('stores provided secret', async () => {
    const store = createWebhookStore(createMockDb());
    const result = await store.createRoute({ agentId: 'a1', name: 'Stripe', secret: 'secret-xyz' });
    expect(result.secret).toBe('secret-xyz');
  });

  it('stores null secret when not provided', async () => {
    const store = createWebhookStore(createMockDb());
    const result = await store.createRoute({ agentId: 'a1', name: 'Test' });
    expect(result.secret).toBeNull();
  });

  it('throws when DB insert fails', async () => {
    const store = createWebhookStore(createMockDb({ insertError: new Error('DB error') }));
    await expect(store.createRoute({ agentId: 'a1', name: 'Fail' })).rejects.toThrow('DB error');
  });
});

// ─── getRoute ────────────────────────────────────────────────────────────────

describe('createWebhookStore — getRoute', () => {
  it('returns route when found', async () => {
    const route = { routeId: 'r1', agentId: 'a1', name: 'Test', secret: null, isActive: true, createdAt: 0, updatedAt: 0 };
    const store = createWebhookStore(createMockDb({ selectResult: [route] }));
    const result = await store.getRoute('r1');
    expect(result).toEqual(route);
  });

  it('returns null when not found', async () => {
    const store = createWebhookStore(createMockDb({ selectResult: [] }));
    const result = await store.getRoute('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null when DB read throws', async () => {
    const store = createWebhookStore(createMockDb({ selectError: new Error('read error') }));
    const result = await store.getRoute('bad');
    expect(result).toBeNull();
  });
});

// ─── listRoutesByAgent ───────────────────────────────────────────────────────

describe('createWebhookStore — listRoutesByAgent', () => {
  it('returns routes ordered by createdAt desc', async () => {
    const routes = [
      { routeId: 'r2', agentId: 'a1', name: 'New', secret: null, isActive: true, createdAt: 200, updatedAt: 200 },
      { routeId: 'r1', agentId: 'a1', name: 'Old', secret: null, isActive: true, createdAt: 100, updatedAt: 100 },
    ];
    const store = createWebhookStore(createMockDb({ selectResult: routes }));
    const result = await store.listRoutesByAgent('a1');
    expect(result).toHaveLength(2);
    expect(result[0].routeId).toBe('r2');
  });

  it('returns empty array on DB error', async () => {
    const store = createWebhookStore(createMockDb({ selectError: new Error('read error') }));
    const result = await store.listRoutesByAgent('a1');
    expect(result).toEqual([]);
  });
});

// ─── deactivateRoute ─────────────────────────────────────────────────────────

describe('createWebhookStore — deactivateRoute', () => {
  it('resolves without throwing on success', async () => {
    const store = createWebhookStore(createMockDb());
    await expect(store.deactivateRoute('r1')).resolves.toBeUndefined();
  });

  it('throws when DB update fails', async () => {
    const store = createWebhookStore(createMockDb({ updateError: new Error('update error') }));
    await expect(store.deactivateRoute('r1')).rejects.toThrow('update error');
  });
});

// ─── createEvent ─────────────────────────────────────────────────────────────

describe('createWebhookStore — createEvent', () => {
  it('creates event with all fields', async () => {
    const store = createWebhookStore(createMockDb());
    const result = await store.createEvent({
      routeId: 'r1', agentId: 'agent-1', payload: { action: 'push' },
      headers: { 'content-type': 'application/json' }, idempotencyKey: 'key-1',
    });
    expect(result.eventId).toBe('mock-id-1');
    expect(result.routeId).toBe('r1');
    expect(result.agentId).toBe('agent-1');
    expect(result.status).toBe('pending');
    expect(result.idempotencyKey).toBe('key-1');
    expect(result.payload).toEqual({ action: 'push' });
  });

  it('sets idempotencyKey to null when not provided', async () => {
    const store = createWebhookStore(createMockDb());
    const result = await store.createEvent({ routeId: 'r1', agentId: 'a1', payload: {}, headers: {} });
    expect(result.idempotencyKey).toBeNull();
  });

  it('throws when DB insert fails', async () => {
    const store = createWebhookStore(createMockDb({ insertError: new Error('DB error') }));
    await expect(store.createEvent({ routeId: 'r1', agentId: 'a1', payload: {}, headers: {} })).rejects.toThrow('DB error');
  });
});

// ─── listEventsByAgent ───────────────────────────────────────────────────────

describe('createWebhookStore — listEventsByAgent', () => {
  it('returns events ordered by receivedAt desc', async () => {
    const events = [
      { eventId: 'e2', routeId: 'r1', agentId: 'a1', payload: {}, headers: {}, idempotencyKey: null, status: 'processed', receivedAt: 200, processedAt: 250 },
      { eventId: 'e1', routeId: 'r1', agentId: 'a1', payload: {}, headers: {}, idempotencyKey: null, status: 'pending', receivedAt: 100, processedAt: null },
    ];
    const store = createWebhookStore(createMockDb({ selectResult: events }));
    const result = await store.listEventsByAgent('a1');
    expect(result).toHaveLength(2);
    expect(result[0].eventId).toBe('e2');
  });

  it('returns empty array on DB error', async () => {
    const store = createWebhookStore(createMockDb({ selectError: new Error('read error') }));
    const result = await store.listEventsByAgent('a1');
    expect(result).toEqual([]);
  });
});

// ─── markProcessed ───────────────────────────────────────────────────────────

describe('createWebhookStore — markProcessed', () => {
  it('resolves without throwing on success', async () => {
    const store = createWebhookStore(createMockDb());
    await expect(store.markProcessed('e1')).resolves.toBeUndefined();
  });

  it('throws when DB update fails', async () => {
    const store = createWebhookStore(createMockDb({ updateError: new Error('update error') }));
    await expect(store.markProcessed('e1')).rejects.toThrow('update error');
  });
});

// ─── markFailed ─────────────────────────────────────────────────────────────

describe('createWebhookStore — markFailed', () => {
  it('resolves without throwing on success', async () => {
    const store = createWebhookStore(createMockDb());
    await expect(store.markFailed('e1')).resolves.toBeUndefined();
  });

  it('throws when DB update fails', async () => {
    const store = createWebhookStore(createMockDb({ updateError: new Error('update error') }));
    await expect(store.markFailed('e1')).rejects.toThrow('update error');
  });
});