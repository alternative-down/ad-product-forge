import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createAgentNotificationStore } from './store.js';

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
  return typeof x === 'object' && x !== null && !Array.isArray(x) && 'value' in x && Array.isArray((x as { value: unknown }).value);
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
      typeof valChunk === 'object' && valChunk !== null &&
      !isSQL(valChunk) && !isStringChunk(valChunk) && 'value' in valChunk
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
  const notifications = new Map<string, NotificationRow>(
    initial.map((n) => [n.id, n]),
  );

  return {
    notifications,
    db: {
      query: {
        agentNotifications: {
          findMany: vi.fn(async (opts?: { where?: unknown; orderBy?: unknown; limit?: number }) => {
            const wh = extractWhere(opts?.where);
            let rows = [...notifications.values()].filter((n) => {
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
          where: vi.fn(async () => ({ returning: vi.fn(async () => []) })),
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

      expect(result.agentId).toBe('agent_1');
      expect(result.content).toBe('Hello world');
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.readAt).toBeNull();
    });

    test('uses provided createdAt when given', async () => {
      const ts = 1700000000000;
      const result = await store.createNotification({
        agentId: 'agent_1',
        content: 'Timed notification',
        createdAt: ts,
      });

      expect(result.createdAt).toBe(ts);
    });

    test('makes notification available via findMany', async () => {
      await store.createNotification({ agentId: 'agent_2', content: 'Test' });

      const list = await mock.db.query.agentNotifications.findMany();
      expect(list).toHaveLength(1);
      expect(list[0].content).toBe('Test');
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
      expect(result.map((n) => n.content)).toEqual(['Third', 'Second', 'First']);
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

    test('returns read:true when markRead is true (default)', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Unread', createdAt: ts, readAt: null },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.listNotifications({ agentId: 'agent_1', limit: 10 });

      expect(result[0].read).toBe(true);
    });

    test('returns read:false when markRead is false', async () => {
      const ts = 1700000000000;
      mock = createMockDb([
        { id: 'n1', agentId: 'agent_1', content: 'Unread', createdAt: ts, readAt: null },
      ]);
      store = createAgentNotificationStore(mock.db);

      const result = await store.listNotifications({
        agentId: 'agent_1',
        limit: 10,
        markRead: false,
      });

      expect(result[0].read).toBe(false);
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
        read: true,
      });
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
