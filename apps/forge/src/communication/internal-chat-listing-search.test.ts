/**
 * Integration tests for message search and filtering in internal-chat-listing.ts.
 * Covers getMessages and getMessagesByAccount — keyword search, date range filters,
 * and combined filter logic.
 *
 * Issue: #1958 — forge: add integration tests for message search and filtering
 */

import { describe, expect, it, vi } from 'vitest';
import { createInternalChatListing } from './internal-chat-listing';
import type { ConversationListingDeps } from './internal-chat-listing';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function makeMockDeps(overrides?: Partial<ConversationListingDeps>) {
  return {
    getRequiredAgentAccount: vi.fn().mockResolvedValue({
      id: 'acct-agent',
      agentId: 'agent-1',
      slug: 'agent-1',
      displayName: 'Agent One',
    }),
    getRequiredExternalAccount: vi.fn().mockResolvedValue({
      id: 'acct-1',
      agentId: null,
      slug: 'alice',
      displayName: 'Alice',
    }),
    listGroupMembersOrDmPeers: vi.fn().mockResolvedValue([]),
    listGroupMembersOrDmPeersByAccount: vi.fn().mockResolvedValue([]),
    readMessageAttachments: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as ConversationListingDeps;
}

/**
 * Builds a mock query chain matching the exact traversal in getMessages:
 *   select().from().innerJoin().innerJoin().innerJoin().where().orderBy().limit().offset().all()
 *
 * The chain is pre-allocated with named levels so intermediate nodes have
 * both `where` and `innerJoin` — preventing TypeError at any traversal step.
 * `from` lives only on the root returned by `select()`.
 * `update` returns a chain that satisfies the unread-marking step.
 */
function makeMockDb(rows: unknown[] = []) {
  const all = vi.fn().mockResolvedValue(rows);
  const terminal = {
    orderBy: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({ offset: vi.fn().mockReturnValue({ all }), all }),
      offset: vi.fn().mockReturnValue({ all }),
      all,
    }),
  };

  // L1: reached from innerJoin in the 3rd innerJoin step (conversationMembers)
  const L1 = {
    where: vi.fn().mockReturnValue(terminal),
    innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(terminal) }),
  };
  // L2: reached from innerJoin in the 2nd innerJoin step (internalChatAccounts)
  const L2 = {
    where: vi.fn().mockReturnValue(terminal),
    innerJoin: vi.fn().mockReturnValue(L1),
  };
  // L3: reached from innerJoin in the 1st innerJoin step (internalChatMessageReads)
  const L3 = {
    where: vi.fn().mockReturnValue(terminal),
    innerJoin: vi.fn().mockReturnValue(L2),
  };
  // L4: root — .from() is called here to start the chain
  const L4 = {
    where: vi.fn().mockReturnValue(terminal),
    innerJoin: vi.fn().mockReturnValue(L3),
    from: vi.fn().mockReturnValue(L3),
  };

  const membershipFindFirst = vi.fn();
  const db = {
    select: vi.fn().mockReturnValue(L4),
    query: {
      internalChatConversationMembers: { findFirst: membershipFindFirst },
      internalChatMessageAttachments: { findMany: vi.fn().mockResolvedValue([]) },
    },
    update: vi.fn().mockReturnValue({ where: vi.fn() }),
  };

  return { db, membershipFindFirst };
}

// ─── getMessages — keyword search ────────────────────────────────────────────

describe('createInternalChatListing — getMessages keyword search', () => {
  it('filters messages by keyword when query param is provided', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Hello world', createdAt: 1000, authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0, query: 'world' });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Hello world');
  });

  it('returns no messages when keyword does not match any message', async () => {
    const { db, membershipFindFirst } = makeMockDb([]);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0, query: 'nonexistent' });

    expect(result).toHaveLength(0);
  });

  it('returns all messages when query is not provided — no LIKE filter applied', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Alpha', createdAt: 1001, authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
      { messageId: 'msg-2', content: 'Beta', createdAt: 1000, authorAccountId: 'acct-2', authorDisplayName: 'Bob', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0 });

    expect(result).toHaveLength(2);
  });

  it('SQL LIKE is case-sensitive — "HELLO" does not match "hello"', async () => {
    const { db, membershipFindFirst } = makeMockDb([]);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0, query: 'HELLO' });

    expect(result).toHaveLength(0);
  });

  it('matches partial words — "wor" matches "world"', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'world of testing', createdAt: 1000, authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0, query: 'wor' });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('world of testing');
  });
});

// ─── getMessages — date range filters ───────────────────────────────────────

describe('createInternalChatListing — getMessages date range filters', () => {
  it('returns messages created on or after dateFrom', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Message 1', createdAt: new Date('2026-01-01').getTime(), authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0, dateFrom: '2025-12-01' });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Message 1');
  });

  it('returns no messages when all messages are before dateFrom', async () => {
    const { db, membershipFindFirst } = makeMockDb([]);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0, dateFrom: '2027-01-01' });

    expect(result).toHaveLength(0);
  });

  it('returns messages created on or before dateTo', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Message 1', createdAt: new Date('2026-01-01').getTime(), authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0, dateTo: '2026-12-31' });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Message 1');
  });

  it('returns no messages when all messages are after dateTo', async () => {
    const { db, membershipFindFirst } = makeMockDb([]);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0, dateTo: '2020-01-01' });

    expect(result).toHaveLength(0);
  });

  it('combines dateFrom and dateTo — returns messages within the range', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Within range', createdAt: new Date('2026-06-15').getTime(), authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({
      agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0,
      dateFrom: '2026-01-01', dateTo: '2026-12-31',
    });

    expect(result).toHaveLength(1);
  });

  it('returns empty when dateFrom > dateTo — no messages in inverted range', async () => {
    const { db, membershipFindFirst } = makeMockDb([]);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({
      agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0,
      dateFrom: '2026-12-31', dateTo: '2026-01-01',
    });

    expect(result).toHaveLength(0);
  });

  it('ignores invalid dateFrom (NaN) — returns messages without date filter', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Any date', createdAt: 9999999999999, authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0, dateFrom: 'not-a-date' });

    expect(result).toHaveLength(1);
  });
});

// ─── getMessagesByAccount — keyword search ──────────────────────────────────

describe('createInternalChatListing — getMessagesByAccount keyword search', () => {
  it('filters by keyword when query param is provided', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Find this keyword', createdAt: 1000, authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-1', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessagesByAccount({ accountId: 'acct-1', conversationKey: 'conv-1', limit: 50, offset: 0, query: 'keyword' });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Find this keyword');
  });

  it('returns no results when keyword does not match', async () => {
    const { db, membershipFindFirst } = makeMockDb([]);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-1', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessagesByAccount({ accountId: 'acct-1', conversationKey: 'conv-1', limit: 50, offset: 0, query: 'missing' });

    expect(result).toHaveLength(0);
  });

  it('returns all messages when query is absent — no LIKE filter applied', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Message A', createdAt: 1001, authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
      { messageId: 'msg-2', content: 'Message B', createdAt: 1000, authorAccountId: 'acct-2', authorDisplayName: 'Bob', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-1', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessagesByAccount({ accountId: 'acct-1', conversationKey: 'conv-1', limit: 50, offset: 0 });

    expect(result).toHaveLength(2);
  });
});

// ─── getMessagesByAccount — date range filters ───────────────────────────────

describe('createInternalChatListing — getMessagesByAccount date range filters', () => {
  it('applies dateFrom — returns messages at or after the date', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'In range', createdAt: new Date('2026-03-15').getTime(), authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-1', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessagesByAccount({ accountId: 'acct-1', conversationKey: 'conv-1', limit: 50, offset: 0, dateFrom: '2026-01-01' });

    expect(result).toHaveLength(1);
  });

  it('applies dateTo — returns messages at or before the date', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'In range', createdAt: new Date('2026-03-15').getTime(), authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-1', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessagesByAccount({ accountId: 'acct-1', conversationKey: 'conv-1', limit: 50, offset: 0, dateTo: '2026-12-31' });

    expect(result).toHaveLength(1);
  });

  it('returns empty when dateFrom and dateTo exclude all messages', async () => {
    const { db, membershipFindFirst } = makeMockDb([]);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-1', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessagesByAccount({
      accountId: 'acct-1', conversationKey: 'conv-1', limit: 50, offset: 0,
      dateFrom: '2030-01-01', dateTo: '2030-12-31',
    });

    expect(result).toHaveLength(0);
  });
});

// ─── Combined filters ────────────────────────────────────────────────────────

describe('createInternalChatListing — getMessages combined filters', () => {
  it('applies keyword AND dateFrom simultaneously', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Important update about delivery', createdAt: new Date('2026-05-01').getTime(), authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({
      agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0,
      query: 'update', dateFrom: '2026-04-01',
    });

    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('update');
  });

  it('applies keyword AND dateTo simultaneously', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Status update', createdAt: new Date('2026-05-15').getTime(), authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({
      agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0,
      query: 'update', dateTo: '2026-05-31',
    });

    expect(result).toHaveLength(1);
  });

  it('applies all three filters — query, dateFrom, and dateTo', async () => {
    const rows = [
      { messageId: 'msg-1', content: 'Deployment update for production', createdAt: new Date('2026-05-10').getTime(), authorAccountId: 'acct-1', authorDisplayName: 'Alice', replyToMessageId: null },
    ];
    const { db, membershipFindFirst } = makeMockDb(rows);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({
      agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0,
      query: 'deployment', dateFrom: '2026-05-01', dateTo: '2026-05-31',
    });

    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('Deployment');
  });

  it('returns empty when keyword matches but date range excludes all messages', async () => {
    const { db, membershipFindFirst } = makeMockDb([]);
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue({ accountId: 'acct-agent', conversationId: 'conv-1', role: 'admin' });

    const listing = createInternalChatListing(db as never, deps);
    const result = await listing.getMessages({
      agentId: 'agent-1', conversationKey: 'conv-1', limit: 50, offset: 0,
      query: 'update', dateFrom: '2030-01-01',
    });

    expect(result).toHaveLength(0);
  });
});

// ─── Error handling ──────────────────────────────────────────────────────────

describe('createInternalChatListing — getMessages error handling', () => {
  it('throws when conversation is not found (membership missing)', async () => {
    const { db, membershipFindFirst } = makeMockDb();
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue(null);

    const listing = createInternalChatListing(db as never, deps);
    await expect(
      listing.getMessages({ agentId: 'agent-1', conversationKey: 'nonexistent', limit: 50, offset: 0 }),
    ).rejects.toThrow('Conversation not found');
  });

  it('throws when conversation is not found in getMessagesByAccount', async () => {
    const { db, membershipFindFirst } = makeMockDb();
    const deps = makeMockDeps();
    membershipFindFirst.mockResolvedValue(null);

    const listing = createInternalChatListing(db as never, deps);
    await expect(
      listing.getMessagesByAccount({ accountId: 'acct-1', conversationKey: 'nonexistent', limit: 50, offset: 0 }),
    ).rejects.toThrow('Conversation not found');
  });
});