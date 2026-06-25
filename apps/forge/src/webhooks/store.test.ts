import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @forge-runtime/core FIRST so encryptSecret + decryptSecret can use forgeDebug.
// In production, encryptSecret/decryptSecret call requireEncryptionKey which throws
// if ENCRYPTION_KEY is unset. In tests, we mock the encryption helpers entirely
// (see below) so the env-var path is never exercised.
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
  and: vi.fn(),
  sql: vi.fn(),
  relations: vi.fn(),
}));

// Mock encryption helpers — store.ts uses encryptSecret (write path) +
// decryptSecret (read path + lazy backfill). Keep them deterministic so
// tests can verify the round-trip without touching ENCRYPTION_KEY.
const ENCRYPTED_MARKER = (plaintext: string) => `enc(${plaintext})`;
const DECRYPT_PREFIX = 'enc(';

vi.mock('../encryption/crypto', () => ({
  encryptSecret: vi.fn((plaintext: string) => ENCRYPTED_MARKER(plaintext)),
  decryptSecret: vi.fn((encrypted: string) =>
    encrypted.startsWith(DECRYPT_PREFIX) && encrypted.endsWith(')')
      ? encrypted.slice(DECRYPT_PREFIX.length, -1)
      : encrypted,
  ),
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),

  errorMsg: vi.fn((err) => err instanceof Error ? err.message : typeof err === "string" ? err : String(err).replace(/^Error: /, "")),
  withToolErrorLogging: vi.fn(async (params) => {
    try {
      return { valid: true, data: await params.fn() };
    } catch (error) {
      // Mirror the real impl: use errorMsg-style formatting
      const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error).replace(/^Error: /, '');
      return { valid: false, error: msg, hint: params.hint || '' };
    }
  }),
}));
vi.mock('../utils/id', () => ({
  createId: vi.fn().mockReturnValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

// Stub crypto.randomBytes for predictable secret generation in tests.
// 32 zero bytes → base64url = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
// (43 chars of 'A').
vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(() => Buffer.alloc(32, 0)),
}));

vi.mock('../database/schema', () => ({
  webhookRoutes: { $columnMap: {} },
  webhookEvents: { $columnMap: {} },
}));

// Drizzle query builder is a chain of calls that returns new query builder objects.
// Each method returns the new object. We simulate this with a chain factory.
function makeChain(returnValue: unknown = undefined) {
  const chain: Record<string, any> = {};
  const methods = ['from', 'where', 'limit', 'orderBy', 'set', 'values', 'onConflictDoNothing', 'returning'];
  methods.forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(returnValue !== undefined ? returnValue : chain);
  });
  // Special: where returns a chain that resolves the promise
  chain._resolveWhere = (val: unknown) => {
    const whereChain: Record<string, any> = {};
    const chainMethods = ['limit', 'orderBy', 'all'];
    chainMethods.forEach((m) => {
      whereChain[m] = vi.fn().mockReturnValue(whereChain);
    });
    whereChain.then = (cb: (v: unknown) => void) => cb(val);
    chain.where.mockReturnValue(whereChain);
    return whereChain;
  };
  return chain;
}

function createMockDb() {
  // insert() → returns a chain with values()
  // update() → returns a chain with set().where()
  // select() → returns a chain with from().where()
  // db itself only has these three methods
  return {
    insert: vi.fn(() => makeChain()),
    update: vi.fn(() => makeChain()),
    select: vi.fn(() => makeChain()),
    delete: vi.fn(() => makeChain()),
  };
}

import { createWebhookStore } from './store';
import { encryptSecret, decryptSecret } from '../encryption/crypto';

describe('createWebhookStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.clearAllMocks();
  });

  describe('createRoute (#5894: encrypted at rest)', () => {
    it('returns route + one-time plaintext secret', async () => {
      const store = createWebhookStore(db as any);
      const result = await store.createRoute({
        agentId: 'agent-1',
        name: 'Test Webhook',
      });
      expect(result).toHaveProperty('route');
      expect(result).toHaveProperty('plaintextSecret');
      expect(result.plaintextSecret).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(result.plaintextSecret.length).toBeGreaterThanOrEqual(43);
    });

    it('writes secretEncrypted (NOT plain secret) to DB', async () => {
      const store = createWebhookStore(db as any);
      await store.createRoute({ agentId: 'agent-1', name: 'Hook' });
      const insertChain = db.insert.mock.results[0].value;
      const valuesArg = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      // Plaintext secret MUST NOT be persisted to the legacy `secret` column.
      expect(valuesArg.secret).toBeNull();
      // Encrypted column MUST be populated.
      expect(valuesArg.secretEncrypted).toBeDefined();
      expect(typeof valuesArg.secretEncrypted).toBe('string');
      expect((valuesArg.secretEncrypted as string).startsWith('enc(')).toBe(true);
      // Last-four MUST be populated for admin display.
      expect(valuesArg.secretLastFour).toBeDefined();
      expect((valuesArg.secretLastFour as string).length).toBe(4);
    });

    it('calls encryptSecret with the plaintext secret', async () => {
      const store = createWebhookStore(db as any);
      await store.createRoute({ agentId: 'agent-1', name: 'Hook' });
      expect(encryptSecret).toHaveBeenCalledTimes(1);
      const [plaintextArg] = (encryptSecret as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(typeof plaintextArg).toBe('string');
      // Plaintext passed to encryptSecret must NOT appear in legacy `secret` column.
      const insertChain = db.insert.mock.results[0].value;
      const valuesArg = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      expect(valuesArg.secret).not.toBe(plaintextArg);
    });

    it('uses createId for the routeId', async () => {
      const store = createWebhookStore(db as any);
      await store.createRoute({ agentId: 'agent-1', name: 'Hook' });
      const insertChain = db.insert.mock.results[0].value;
      const valuesArg = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      expect(valuesArg.routeId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('calls db.insert with webhookRoutes', async () => {
      const store = createWebhookStore(db as any);
      await store.createRoute({ agentId: 'agent-1', name: 'Hook' });
      expect(db.insert).toHaveBeenCalledWith({ $columnMap: {} });
    });
  });

  describe('getRoute (#5894: decrypts secret for HMAC verification)', () => {
    it('returns null when no route matches', async () => {
      const store = createWebhookStore(db as any);
      db.select().from().where().limit().all = vi.fn().mockResolvedValue([]);
      // Re-stub the select chain to return [].
      db.select.mockReturnValueOnce(makeChain()._resolveWhere([]));
      const result = await store.getRoute('missing');
      expect(result).toBeNull();
    });

    it('decrypts secretEncrypted and returns plaintext in `secret` field (Path A)', async () => {
      const storedRoute = {
        routeId: 'route-1',
        agentId: 'agent-1',
        name: 'Hook',
        secret: null,
        secretEncrypted: 'enc(my-plain-secret)',
        secretLastFour: 'cret',
        isActive: 1,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      };
      const store = createWebhookStore(db as any);
      db.select.mockReturnValueOnce(makeChain()._resolveWhere([storedRoute]));

      const result = await store.getRoute('route-1');
      expect(result).not.toBeNull();
      expect(result!.secret).toBe('my-plain-secret');
      expect(decryptSecret).toHaveBeenCalledWith('enc(my-plain-secret)');
    });

    it('lazy-backfills legacy plain secret to secretEncrypted on first read (Path B)', async () => {
      // Legacy row: secret='legacy-plain', secretEncrypted=null
      const storedRoute = {
        routeId: 'route-legacy',
        agentId: 'agent-1',
        name: 'Legacy Hook',
        secret: 'legacy-plain',
        secretEncrypted: null,
        secretLastFour: null,
        isActive: 1,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      };
      const store = createWebhookStore(db as any);
      db.select.mockReturnValueOnce(makeChain()._resolveWhere([storedRoute]));

      const result = await store.getRoute('route-legacy');
      expect(result).not.toBeNull();
      // Caller still gets the plaintext for THIS read.
      expect(result!.secret).toBe('legacy-plain');
      // Update was issued to persist the encrypted form for next read.
      expect(db.update).toHaveBeenCalled();
      const updateChain = db.update.mock.results[0].value;
      const setArg = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.secretEncrypted).toBe('enc(legacy-plain)');
      expect(setArg.secretLastFour).toBe('lain');
    });

    it('returns null secret when both columns are empty', async () => {
      const storedRoute = {
        routeId: 'route-nosecret',
        agentId: 'agent-1',
        name: 'NoSecret Hook',
        secret: null,
        secretEncrypted: null,
        secretLastFour: null,
        isActive: 1,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      };
      const store = createWebhookStore(db as any);
      db.select.mockReturnValueOnce(makeChain()._resolveWhere([storedRoute]));

      const result = await store.getRoute('route-nosecret');
      expect(result).not.toBeNull();
      expect(result!.secret).toBeNull();
      // No update issued (nothing to backfill).
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('rotateRouteSecret (#5894: NEW)', () => {
    it('generates new plaintext secret, encrypts, updates row, returns plaintext one-time', async () => {
      const updatedRoute = {
        routeId: 'route-1',
        agentId: 'agent-1',
        name: 'Hook',
        secret: null,
        secretEncrypted: 'enc(new-secret)',
        secretLastFour: 'cret',
        isActive: 1,
        createdAt: 1700000000000,
        updatedAt: 1700000000999,
      };
      // update().set().where().returning() → chain ending with .returning() = [updatedRoute]
      const updateChain = makeChain();
      updateChain.returning.mockReturnValueOnce(Promise.resolve([updatedRoute]));
      db.update.mockReturnValueOnce(updateChain);

      const store = createWebhookStore(db as any);
      const result = await store.rotateRouteSecret('route-1');

      expect(result).toHaveProperty('route');
      expect(result).toHaveProperty('plaintextSecret');
      expect(result.route.secretEncrypted).toBe('enc(new-secret)');
      expect(encryptSecret).toHaveBeenCalledWith(result.plaintextSecret);
      expect(db.update).toHaveBeenCalled();
    });

    it('throws when route does not exist (returning returns [])', async () => {
      const updateChain = makeChain();
      updateChain.returning.mockReturnValueOnce(Promise.resolve([]));
      db.update.mockReturnValueOnce(updateChain);

      const store = createWebhookStore(db as any);
      await expect(store.rotateRouteSecret('missing-route')).rejects.toThrow(
        /Cannot rotate secret: route missing-route not found/,
      );
    });
  });

  describe('listRoutesByAgent', () => {
    it('returns routes for the agent ordered by createdAt desc', async () => {
      const routes = [{ routeId: 'r1', agentId: 'agent-1', name: 'A', createdAt: 100 }];
      const store = createWebhookStore(db as any);
      db.select.mockReturnValueOnce(makeChain()._resolveWhere(routes));
      const result = await store.listRoutesByAgent('agent-1');
      expect(result).toEqual(routes);
    });

    it('returns empty array when no routes exist', async () => {
      const store = createWebhookStore(db as any);
      db.select.mockReturnValueOnce(makeChain()._resolveWhere([]));
      const result = await store.listRoutesByAgent('agent-empty');
      expect(result).toEqual([]);
    });
  });

  describe('deactivateRoute', () => {
    it('calls db.update with webhookRoutes', async () => {
      const store = createWebhookStore(db as any);
      await store.deactivateRoute('route-1');
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('createEvent (unchanged from D21 tests)', () => {
    it('returns kind: created with eventId when no idempotencyKey is provided', async () => {
      const store = createWebhookStore(db as any);
      const result = await store.createEvent({
        routeId: 'r1',
        agentId: 'a1',
        payload: { foo: 'bar' },
        headers: { 'content-type': 'application/json' },
      });
      expect(result.kind).toBe('created');
      expect((result as { kind: 'created'; eventId: string }).eventId).toBeDefined();
    });

    it('returns kind: created when idempotencyKey is empty string (AC-3: empty == missing)', async () => {
      const store = createWebhookStore(db as any);
      const result = await store.createEvent({
        routeId: 'r1',
        agentId: 'a1',
        payload: { foo: 'bar' },
        headers: { 'content-type': 'application/json' },
        idempotencyKey: '',
      });
      expect(result.kind).toBe('created');
      expect((result as { kind: 'created'; eventId: string }).eventId).toBeDefined();
      // Empty string hits the simple-insert branch, NOT the onConflictDoNothing branch.
      const insertChain = db.insert.mock.results[0].value;
      expect(insertChain.onConflictDoNothing).not.toHaveBeenCalled();
    });

    it('returns kind: created with new eventId when idempotencyKey is provided AND INSERT succeeds (AC-4)', async () => {
      const NEW_EVENT_ID = 'new-event-abc';
      const insertChain = makeChain();
      insertChain.returning = vi.fn().mockReturnValue([{ eventId: NEW_EVENT_ID }]);
      db.insert.mockReturnValueOnce(insertChain);
      const store = createWebhookStore(db as any);
      const result = await store.createEvent({
        routeId: 'r1',
        agentId: 'a1',
        payload: { foo: 'bar' },
        headers: { 'content-type': 'application/json' },
        idempotencyKey: 'key-1',
      });
      expect(result.kind).toBe('created');
      expect((result as { kind: 'created'; eventId: string }).eventId).toBe(NEW_EVENT_ID);
      const usedChain = db.insert.mock.results[0].value;
      expect(usedChain.onConflictDoNothing).toHaveBeenCalled();
    });

    it('returns kind: duplicate with SAME eventId on replay (AC-1)', async () => {
      const EXISTING_EVENT_ID = 'existing-event-xyz';
      const insertChain = makeChain();
      insertChain.returning = vi.fn().mockReturnValue([]);
      db.insert.mockReturnValueOnce(insertChain);
      // Custom chain: db.select().from().where().limit().all() resolves to EXISTING_EVENT_ID.
      const selectChain = makeChain();
      const whereChain: Record<string, any> = {};
      ['limit', 'orderBy', 'all'].forEach((m) => { whereChain[m] = vi.fn().mockReturnValue(whereChain); });
      whereChain.then = (cb: (v: unknown) => void) => cb([{ eventId: EXISTING_EVENT_ID }]);
      selectChain.where = vi.fn().mockReturnValue(whereChain);
      db.select.mockReturnValueOnce(selectChain);
      const store = createWebhookStore(db as any);
      const result = await store.createEvent({
        routeId: 'r1',
        agentId: 'a1',
        payload: { foo: 'bar' },
        headers: { 'content-type': 'application/json' },
        idempotencyKey: 'key-1',
      });
      expect(result.kind).toBe('duplicate');
      expect((result as { kind: 'duplicate'; eventId: string }).eventId).toBe(EXISTING_EVENT_ID);
    });

    it('throws when INSERT OR IGNORE returns 0 AND SELECT finds no existing row (race condition guard)', async () => {
      const insertChain = makeChain();
      insertChain.returning = vi.fn().mockReturnValue([]);
      db.insert.mockReturnValueOnce(insertChain);
      // Custom chain: db.select().from().where().limit().all() resolves to [] (no existing row).
      const selectChain = makeChain();
      const whereChain: Record<string, any> = {};
      ['limit', 'orderBy', 'all'].forEach((m) => { whereChain[m] = vi.fn().mockReturnValue(whereChain); });
      whereChain.then = (cb: (v: unknown) => void) => cb([]);
      selectChain.where = vi.fn().mockReturnValue(whereChain);
      db.select.mockReturnValueOnce(selectChain);
      const store = createWebhookStore(db as any);
      await expect(
        store.createEvent({
          routeId: 'r1',
          agentId: 'a1',
          payload: { foo: 'bar' },
          headers: { 'content-type': 'application/json' },
          idempotencyKey: 'key-1',
        }),
      ).rejects.toThrow(/Idempotency conflict but no existing event found/);
    });

    it('uses the COMPOSITE (routeId, idempotencyKey) conflict target (AC-2: scoped per route)', async () => {
      const insertChain = makeChain();
      insertChain.returning = vi.fn().mockReturnValue([]);
      db.insert.mockReturnValueOnce(insertChain);
      const selectChain = makeChain();
      const whereChain: Record<string, any> = {};
      ['limit', 'orderBy', 'all'].forEach((m) => { whereChain[m] = vi.fn().mockReturnValue(whereChain); });
      whereChain.then = (cb: (v: unknown) => void) => cb([{ eventId: 'X' }]);
      selectChain.where = vi.fn().mockReturnValue(whereChain);
      db.select.mockReturnValueOnce(selectChain);
      const store = createWebhookStore(db as any);
      await store.createEvent({
        routeId: 'route-A',
        agentId: 'a1',
        payload: {},
        headers: {},
        idempotencyKey: 'shared-key',
      });
      const usedChain = db.insert.mock.results[0].value;
      expect(usedChain.onConflictDoNothing).toHaveBeenCalledTimes(1);
      const onConflictArg = (usedChain.onConflictDoNothing as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(onConflictArg).toHaveProperty('target');
      expect(Array.isArray(onConflictArg.target)).toBe(true);
      expect(onConflictArg.target).toHaveLength(2);
    });

    it('persists idempotencyKey as NULL when not provided (not empty string)', async () => {
      const store = createWebhookStore(db as any);
      await store.createEvent({
        routeId: 'r1',
        agentId: 'a1',
        payload: {},
        headers: {},
      });
      const insertChain = db.insert.mock.results[0].value;
      const valuesArg = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      expect(valuesArg.idempotencyKey).toBeNull();
    });

    it('persists idempotencyKey as the provided string when present', async () => {
      const insertChain = makeChain();
      insertChain.returning = vi.fn().mockReturnValue([{ eventId: 'X' }]);
      db.insert.mockReturnValueOnce(insertChain);
      const store = createWebhookStore(db as any);
      await store.createEvent({
        routeId: 'r1',
        agentId: 'a1',
        payload: {},
        headers: {},
        idempotencyKey: 'my-stable-key',
      });
      const usedChain = db.insert.mock.results[0].value;
      const valuesArg = (usedChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      expect(valuesArg.idempotencyKey).toBe('my-stable-key');
    });
  });
});
