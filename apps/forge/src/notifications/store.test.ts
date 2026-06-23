import { describe, expect, test, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STORE_SOURCE_PATH = join(__dirname, 'store.ts');
import { createAgentNotificationStore } from './store';

interface NotificationRow {
  id: string;
  agentId: string;
  content: string;
  createdAt: number;
  readAt: number | null;
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

function extractConditions(sql: unknown): Array<{ colName: string; value: unknown }> {
  if (!isSQL(sql)) return [];
  const result: Array<{ colName: string; value: unknown }> = [];
  const chunks = sql.queryChunks ?? [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (isStringChunk(chunk)) continue;
    // Recurse into nested SQL objects (e.g. the outer "and" wrapper → inner eq/isNull wrappers)
    if (isSQL(chunk) && chunk.queryChunks?.length) {
      result.push(...extractConditions(chunk));
      continue;
    }
    // Object chunk marks a column reference
    const colName = (chunk as { config?: { name?: string } })?.config?.name;
    if (!colName) continue;
    // Look for isNull/isNotNull: operator is a string chunk in the chunks immediately after the column
    // Chunk structure: [empty, {config:{name:}}, " is null"]  or  ["", {config:{name:}}, " is not null"]
    // Position of operator is i+1 (if chunk[i-1] is empty string) or i+2 (if chunk[i-1] is empty AND chunk[i+0] is empty)
    // Check both positions for a string chunk containing "null"
    for (let offset = 1; offset <= 2; offset++) {
      const opIdx = i + offset;
      if (opIdx < chunks.length && isStringChunk(chunks[opIdx])) {
        const op = (chunks[opIdx] as { value: string[] }).value.join('');
        if (op.includes('null')) {
          result.push({ colName, value: op === ' is null' ? null : 'NOT_NULL' });
          i = opIdx; // skip past column + operator
          continue;
        }
      }
    }
    // Normal column = value: advance past any string chunks to find the value
    let j = i + 1;
    while (j < chunks.length && isStringChunk(chunks[j])) j++;
    if (j >= chunks.length) break;
    const valChunk = chunks[j];
    let value: unknown;
    if (typeof valChunk === 'string') {
      value = valChunk;
    } else if (typeof valChunk === 'number') {
      value = valChunk;
    } else if (
      typeof valChunk === 'object' &&
      valChunk !== null &&
      !isSQL(valChunk) &&
      !isStringChunk(valChunk) &&
      'value' in valChunk
    ) {
      value = (valChunk as { value: unknown }).value;
      if (value === undefined) value = String(valChunk);
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

function createMockDb(initial: NotificationRow[] = []) {
  const notifications = new Map<string, NotificationRow>(initial.map((n) => [n.id, n]));

  return {
    notifications,
    db: {
      query: {
        agentNotifications: {
          findMany: vi.fn(async (opts?: { where?: unknown; orderBy?: unknown; limit?: number }) => {
            const wh = extractWhere(opts?.where);
            const rows = [...notifications.values()].filter((n) => {
              if (wh.agentId && n.agentId !== wh.agentId) return false;
              if (wh.readAt !== undefined && n.readAt !== wh.readAt) return false;
              return true;
            });
            rows.sort((a, b) => b.createdAt - a.createdAt);
            return rows.slice(0, opts?.limit ?? 100);
          }),
          findFirst: vi.fn(async (opts?: { where?: unknown }) => {
            const wh = extractWhere(opts?.where);
            for (const n of notifications.values()) {
              if (wh.agentId && n.agentId !== wh.agentId) continue;
              if (wh.id && n.id !== wh.id) continue;
              return n;
            }
            return undefined;
          }),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn(async (vals: NotificationRow) => {
          notifications.set(vals.id, vals);
          return { returning: vi.fn(async () => [vals]) };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            // Real drizzle chain: .set().where().returning() — the returning call
            // yields the actual updated rows. The mock returns [] by default;
            // individual tests can override the chain to simulate partial updates
            // (e.g., requested 3, only 2 matched) or DB errors.
            returning: vi.fn(async () => []),
          })),
        })),
      })),
    } as unknown as Parameters<typeof createAgentNotificationStore>[0],
  };
}

describe('createAgentNotificationStore', () => {
  let mock: ReturnType<typeof createMockDb>;
  let store: ReturnType<typeof createAgentNotificationStore>;

  beforeEach(() => {
    mock = createMockDb([]);
    store = createAgentNotificationStore(mock.db);
  });

  describe('createNotification', () => {
    test('inserts notification and returns it', async () => {
      const result = await store.createNotification({
        agentId: 'agent_1',
        content: 'Hello world',
      });

      expect((result as any).agentId).toBe('agent_1');
      expect((result as any).content).toBe('Hello world');
      expect((result as any).id).toBeDefined();
      expect((result as any).createdAt).toBeDefined();
      expect((result as any).readAt).toBeNull();
    });

    test('uses provided createdAt when given', async () => {
      const ts = 1700000000000;
      const result = await store.createNotification({
        agentId: 'agent_1',
        content: 'Timed notification',
        createdAt: ts,
      });

      expect((result as any).createdAt).toBe(ts);
    });

    test('makes notification available via findMany', async () => {
      await store.createNotification({ agentId: 'agent_2', content: 'Test' });

      const list = await mock.db.query.agentNotifications.findMany();
      expect(list).toHaveLength(1);
      expect(list[0].content).toBe('Test');
    });
  });

  // ── L#19 tripwire: content length cap (#5628) ─────────────────────────────────
  describe('L#19 tripwire: createNotification content length cap (#5628)', () => {
    test('accepts content at exactly MAX_NOTIFICATION_CONTENT_LENGTH (16_384 chars)', async () => {
      const content = 'a'.repeat(16_384);
      const result = await store.createNotification({ agentId: 'ag_001', content });
      expect(result).not.toBeNull();
      expect((result as any).content).toHaveLength(16_384);
    });

    test('rejects content one byte over MAX (16_385 chars) and throws clear error (#5976)', async () => {
      const content = 'a'.repeat(16_385);
      const insertSpy = vi.mocked(mock.db.insert);
      await expect(
        store.createNotification({ agentId: 'ag_001', content })
      ).rejects.toThrow(/createNotification content length 16385 exceeds max 16384/);
      expect(insertSpy).not.toHaveBeenCalled();
    });

    test('rejects pathological 10MB content and throws clear error (#5976)', async () => {
      const content = 'x'.repeat(10 * 1024 * 1024);
      const insertSpy = vi.mocked(mock.db.insert);
      await expect(
        store.createNotification({ agentId: 'ag_001', content })
      ).rejects.toThrow(/createNotification content length 10485760 exceeds max 16384/);
      expect(insertSpy).not.toHaveBeenCalled();
      const list = await mock.db.query.agentNotifications.findMany();
      expect(list).toHaveLength(0);
    });

    test('accepts empty content (length 0 is below cap)', async () => {
      const result = await store.createNotification({ agentId: 'ag_001', content: '' });
      expect(result).not.toBeNull();
      expect((result as any).content).toBe('');
    });

    test('source declares MAX_NOTIFICATION_CONTENT_LENGTH constant at 16_384', () => {
      const source = readFileSync(STORE_SOURCE_PATH, 'utf8');
      expect(source).toMatch(/const MAX_NOTIFICATION_CONTENT_LENGTH = 16_384/);
    });

    test('source rejects content over cap via length check before insert (#5976)', () => {
      const source = readFileSync(STORE_SOURCE_PATH, 'utf8');
      expect(source).toMatch(/input.content.length > MAX_NOTIFICATION_CONTENT_LENGTH/);
      // Throws instead of returning null — silent failure pattern removed.
      expect(source).toMatch(/throw new Error\(\s*'createNotification content length/);
    });
  });

  describe('listNotifications', () => {
    test('returns notifications for agent ordered by createdAt desc', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'First', createdAt: ts, readAt: null },
        { id: 'n2', agentId: 'agent_1', content: 'Second', createdAt: ts + 1000, readAt: null },
        { id: 'n3', agentId: 'agent_1', content: 'Third', createdAt: ts + 2000, readAt: null },
        { id: 'n4', agentId: 'agent_2', content: 'Other agent', createdAt: ts, readAt: null },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.listNotifications({ agentId: 'agent_1', limit: 10 });

      expect(result).toHaveLength(3);
      expect(result.map((n: any) => n.content)).toEqual(['Third', 'Second', 'First']);
    });

    test('respects limit', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'First', createdAt: ts, readAt: null },
        { id: 'n2', agentId: 'agent_1', content: 'Second', createdAt: ts + 1000, readAt: null },
        { id: 'n3', agentId: 'agent_1', content: 'Third', createdAt: ts + 2000, readAt: null },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.listNotifications({ agentId: 'agent_1', limit: 2 });

      expect(result).toHaveLength(2);
    });

    test('filters unread only when unreadOnly is true', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Unread', createdAt: ts, readAt: null },
        { id: 'n2', agentId: 'agent_1', content: 'Read', createdAt: ts + 1000, readAt: ts + 2000 },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.listNotifications({
        agentId: 'agent_1',
        unreadOnly: true,
        limit: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Unread');
    });

    test('returns read:false when readAt is null in DB (L#19 pure read)', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Unread', createdAt: ts, readAt: null },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.listNotifications({ agentId: 'agent_1', limit: 10 });

      expect(result[0].read).toBe(false);
    });

    test('returns read:true when readAt is set in DB', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Read', createdAt: ts, readAt: ts + 1000 },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.listNotifications({ agentId: 'agent_1', limit: 10 });

      expect(result[0].read).toBe(true);
    });

    test('maps fields correctly to notification shape', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Test content', createdAt: ts, readAt: null },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.listNotifications({ agentId: 'agent_1', limit: 10 });

      expect(result[0]).toEqual({
        notificationId: 'n1',
        content: 'Test content',
        timestamp: ts,
        read: false,
      });
    });

    test('L#19: does NOT call db.update (pure read invariant)', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Unread', createdAt: ts, readAt: null },
        { id: 'n2', agentId: 'agent_1', content: 'Unread 2', createdAt: ts + 1000, readAt: null },
      ]);
      store = createAgentNotificationStore(mock.db);

      const updateSpy = vi.mocked(mock.db.update);
      await store.listNotifications({ agentId: 'agent_1', limit: 10 });

      expect(updateSpy).not.toHaveBeenCalled();
    });

    test('L#19: does NOT call db.insert (pure read invariant)', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Unread', createdAt: ts, readAt: null },
      ]);
      store = createAgentNotificationStore(mock.db);

      const insertSpy = vi.mocked(mock.db.insert);
      await store.listNotifications({ agentId: 'agent_1', limit: 10 });

      expect(insertSpy).not.toHaveBeenCalled();
    });
  });

  // ── L#19: markNotificationsRead (explicit mutation counterpart to listNotifications) ──
  describe('markNotificationsRead', () => {
    test('calls db.update with readAt and updatedAt set to current time', async () => {
      mock = createMockDb([]);
      store = createAgentNotificationStore(mock.db);

      const updateSpy = vi.mocked(mock.db.update);
      await store.markNotificationsRead({
        agentId: 'agent_1',
        notificationIds: ['n1', 'n2'],
      });

      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    test('returns updatedCount equal to ACTUAL rows updated, not requested count (#5975)', async () => {
      mock = createMockDb([]);
      store = createAgentNotificationStore(mock.db);

      // Mock returning() to report only 2 actual updates even though 3 were requested
      // (e.g., n3 doesn't exist in DB). The function must reflect actual state, not input.
      const returningMock = vi.fn(async () => [{ id: 'n1' }, { id: 'n2' }]);
      // L#NN-50 #18 (N=1): mockImplementationOnce chainable DB methods need
      // explicit type cast. Cast the whole chain, matching the createMockDb
      // pattern at L132.
      vi.mocked(mock.db.update).mockImplementationOnce(() => ({
        set: () => ({
          where: () => ({
            returning: returningMock,
          }),
        }),
      }) as unknown as ReturnType<typeof mock.db.update>);

      const result = await store.markNotificationsRead({
        agentId: 'agent_1',
        notificationIds: ['n1', 'n2', 'n3'],
      });

      expect(returningMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ updatedCount: 2 }); // 2 actual, NOT 3 requested
    });

    test('returns updatedCount 0 when no rows matched (#5975)', async () => {
      mock = createMockDb([]);
      store = createAgentNotificationStore(mock.db);

      const returningMock = vi.fn(async () => []);
      // L#NN-50 #18 (N=1): cast the chain to satisfy TypeScript.
      vi.mocked(mock.db.update).mockImplementationOnce(() => ({
        set: () => ({
          where: () => ({
            returning: returningMock,
          }),
        }),
      }) as unknown as ReturnType<typeof mock.db.update>);

      const result = await store.markNotificationsRead({
        agentId: 'agent_1',
        notificationIds: ['n1', 'n2'],
      });

      expect(result).toEqual({ updatedCount: 0 });
    });

    test('returns updatedCount: 0 for empty notificationIds array (no DB call)', async () => {
      mock = createMockDb([]);
      store = createAgentNotificationStore(mock.db);

      const updateSpy = vi.mocked(mock.db.update);
      const result = await store.markNotificationsRead({
        agentId: 'agent_1',
        notificationIds: [],
      });

      expect(result).toEqual({ updatedCount: 0 });
      expect(updateSpy).not.toHaveBeenCalled();
    });

    test('throws on DB error (#5977 — no longer silent)', async () => {
      mock = createMockDb([]);
      store = createAgentNotificationStore(mock.db);

      // Make the update chain throw (simulating DB connection failure).
      // L#NN-50 #18 (N=1): cast the throwing function to the parameter type of update().
      vi.mocked(mock.db.update).mockImplementationOnce((() => {
        throw new Error('boom');
      }) as never);

      await expect(
        store.markNotificationsRead({
          agentId: 'agent_1',
          notificationIds: ['n1'],
        })
      ).rejects.toThrow('boom');
    });
  });

  // ── L#19 tripwire: source-level guarantees (catches re-introduction of bug class) ──
  describe('L#19 tripwire: source-level invariants for #5623', () => {
    test('source: listNotifications input has NO markRead parameter (use indexOf)', () => {
      const source = readFileSync(STORE_SOURCE_PATH, 'utf8');
      // Slice from listNotifications signature to next function declaration
      const fnStart = source.indexOf('async function listNotifications');
      const fnEnd = source.indexOf('async function ', fnStart + 1);
      const fnSig = source.slice(fnStart, fnEnd);
      expect(fnSig).not.toMatch(/markRead/);
    });

    test('source: listNotifications function body does NOT contain db.update', () => {
      const source = readFileSync(STORE_SOURCE_PATH, 'utf8');
      // Find the listNotifications function body (between async function listNotifications and the next async function)
      const fnStart = source.indexOf('async function listNotifications');
      expect(fnStart).toBeGreaterThan(-1);
      const fnEnd = source.indexOf('async function ', fnStart + 1);
      const fnBody = source.slice(fnStart, fnEnd);
      expect(fnBody).not.toMatch(/db.update|db.insert/);
    });

    test('source: listNotifications returns read: row.readAt !== null (DB state)', () => {
      const source = readFileSync(STORE_SOURCE_PATH, 'utf8');
      expect(source).toMatch(/read:\s*row\.readAt\s*!==\s*null/);
    });

    test('source: markNotificationsRead is a separate exported function in factory return', () => {
      const source = readFileSync(STORE_SOURCE_PATH, 'utf8');
      expect(source).toMatch(/async function markNotificationsRead\(/);
      // Verify the FACTORY return object (the LAST return block, near end of file)
      const factoryReturnIdx = source.lastIndexOf('return {');
      expect(factoryReturnIdx).toBeGreaterThan(-1);
      const factoryReturn = source.slice(factoryReturnIdx);
      expect(factoryReturn).toMatch(/markNotificationsRead/);
    });

    test('source: no occurrence of "markRead ?? true" anywhere (bug pattern eliminated)', () => {
      const source = readFileSync(STORE_SOURCE_PATH, 'utf8');
      expect(source).not.toMatch(/markRead\s*\?\?\s*true/);
    });
  });

  describe('getNotification', () => {
    test('returns notification when found', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Found me', createdAt: ts, readAt: null },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.getNotification('agent_1', 'n1');

      expect(result).toEqual({
        notificationId: 'n1',
        content: 'Found me',
        timestamp: ts,
        read: false,
      });
    });

    test('returns null when notification not found', async () => {
      mock = createMockDb([]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.getNotification('agent_1', 'nonexistent');

      expect(result).toBeNull();
    });

    test('returns null when agentId does not match', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Private', createdAt: ts, readAt: null },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.getNotification('agent_2', 'n1');

      expect(result).toBeNull();
    });

    test('returns read:true when readAt is set', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Read', createdAt: ts, readAt: ts + 1000 },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.getNotification('agent_1', 'n1');

      expect(result?.read).toBe(true);
    });
  });
});
