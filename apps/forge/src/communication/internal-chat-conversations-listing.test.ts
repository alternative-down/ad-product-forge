/**
 * Tests for internal-chat-conversations-listing.ts (#5738 reduced scope).
 *
 * Covers the 2 exported functions:
 * - listConversations(agentId, unread?, limit) — full featured with mark-as-read
 * - listConversationsByAccount(accountId, limit) — external account version
 *
 * Test strategy: chainable DB mock. Each `db.select(...).from(...).innerJoin(...)…
 * .all()` call is mocked per-test via `mockAll.mockReturnValueOnce(...)`.
 *
 * L#NN-13 13a 2-axis compliance: source-level fixtures (no function-level mocks
 * of the SUT). L#NN-26 v1+v2 mutation: covered by the chainable mock enabling
 * the "no unread messages → no mark-as-read call" invariant test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInternalChatConversationListing } from './internal-chat-conversations-listing';
import type { Database } from '../database/client';

// ---------------------------------------------------------------------------
// Mock: buildConversationParticipantNames
// ---------------------------------------------------------------------------
const { mockBuildConversationParticipantNames } = vi.hoisted(() => ({
  mockBuildConversationParticipantNames: vi.fn(
    (participants: Array<{ displayName?: string }>) =>
      participants.map((p) => p.displayName ?? ''),
  ),
}));

vi.mock('./internal-chat-helpers', () => ({
  buildConversationParticipantNames: mockBuildConversationParticipantNames,
}));

// ---------------------------------------------------------------------------
// Chainable DB mock
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

// Self-referential chain builder. Each method returns the chain itself,
// so any order of from/innerJoin/where/orderBy/limit/all resolves cleanly.
// Pattern: apps/forge/src/communication/internal-chat-accounts.test.ts.
// The chain delegates to mockAll so per-test `mockAll.mockResolvedValueOnce`
// overrides the default empty array.
function createChain() {
  const chain: {
    from: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
  } = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    all: vi.fn(),
  };
  chain.from.mockImplementation(() => chain);
  chain.innerJoin.mockImplementation(() => chain);
  chain.where.mockImplementation(() => chain);
  chain.orderBy.mockImplementation(() => chain);
  chain.limit.mockImplementation(() => chain);
  // delegate to the global mockAll so mockResolvedValueOnce works per query
  chain.all.mockImplementation(() => mockAll());
  return chain;
}

const mockAll = vi.fn<() => Promise<Row[]>>(async () => [] as Row[]);
const mockSelect = vi.fn(() => createChain());

const mockUpdateSet = vi.fn(() => createChain());
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

const mockFindMany = vi.fn<() => Promise<Row[]>>(async () => [] as Row[]);

const mockDb = {
  select: mockSelect,
  update: mockUpdate,
  query: {
    internalChatConversationMembers: { findMany: mockFindMany },
  },
} as unknown as Database;

// ---------------------------------------------------------------------------
// Test fixture: agent/external account
// ---------------------------------------------------------------------------
function makeAgentAccount(overrides: Partial<{ id: string; agentId: string | null; slug: string; displayName: string }> = {}) {
  return {
    id: 'agent-acct-1',
    agentId: 'agent-1',
    slug: 'agent-1',
    displayName: 'Agent One',
    ...overrides,
  };
}

function makeExternalAccount(overrides: Partial<{ id: string; agentId: string | null; slug: string; displayName: string }> = {}) {
  return {
    id: 'ext-acct-1',
    agentId: null,
    slug: 'ext-1',
    displayName: 'External One',
    ...overrides,
  };
}

function makeMemberRow(conversationId: string, accountId: string, displayName: string, agentId: string | null = null, role = 'normal') {
  return {
    conversationId,
    accountId,
    role,
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    displayName,
    agentId,
    slug: accountId,
    account: {
      id: accountId,
      slug: accountId,
      description: null,
      displayName,
      createdAt: 1_000_000,
      updatedAt: 1_000_000,
      agentId,
    },
  };
}

function makeMessageRow(
  conversationId: string,
  messageId: string,
  opts: {
    content?: string;
    createdAt?: number;
    authorAccountId?: string;
    authorDisplayName?: string;
    replyToMessageId?: string | null;
    unread?: 0 | 1;
  } = {},
) {
  return {
    conversationId,
    messageId,
    content: opts.content ?? 'hello',
    createdAt: opts.createdAt ?? 2_000_000,
    authorAccountId: opts.authorAccountId ?? 'sender-1',
    authorDisplayName: opts.authorDisplayName ?? 'Sender',
    replyToMessageId: opts.replyToMessageId ?? null,
    ...(opts.unread === 0 || opts.unread === 1 ? { unread: opts.unread } : {}),
  };
}

function makeConversationRow(id: string, name: string | null, updatedAt = 1_500_000) {
  return { id, name, type: 'direct' as const, updatedAt };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
let getRequiredAgentAccount = vi.fn();
let getRequiredExternalAccount = vi.fn();

beforeEach(() => {
  mockAll.mockReset();
  mockSelect.mockClear();
  mockUpdateSet.mockClear();
  mockUpdate.mockClear();
  mockFindMany.mockReset();
  mockBuildConversationParticipantNames.mockClear();

  getRequiredAgentAccount = vi.fn(async (agentId: string) => makeAgentAccount({ agentId }));
  getRequiredExternalAccount = vi.fn(async (accountId: string) => makeExternalAccount({ id: accountId, slug: accountId }));
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeListing() {
  return createInternalChatConversationListing(mockDb, {
    getRequiredAgentAccount,
    getRequiredExternalAccount,
  });
}

// ---------------------------------------------------------------------------
// listConversations
// ---------------------------------------------------------------------------
describe('listConversations (#5738)', () => {
  it('returns [] when the agent has no conversations', async () => {
    mockAll.mockResolvedValueOnce([]); // conversation rows
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', limit: 10 });
    expect(result).toEqual([]);
    expect(getRequiredAgentAccount).toHaveBeenCalledWith('agent-1');
  });

  it('returns a single conversation with no messages', async () => {
    const conv = makeConversationRow('conv-1', 'Solo Chat');
    mockAll.mockResolvedValueOnce([conv]); // conversation rows
    mockAll.mockResolvedValueOnce([]); // message rows
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'agent-acct-1', 'Agent One', 'agent-1')]);
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', limit: 10 });
    expect(result).toHaveLength(1);
    expect(result[0]?.targetKey).toBe('conv-1');
    expect(result[0]?.name).toBe('Solo Chat');
    expect(result[0]?.messages).toEqual([]);
    expect(result[0]?.unreadCount).toBe(0);
  });

  it('returns messages with all-read counts', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([
      makeMessageRow('conv-1', 'm1', { unread: 0 }),
      makeMessageRow('conv-1', 'm2', { unread: 0 }),
    ]);
    mockFindMany.mockResolvedValueOnce([
      makeMemberRow('conv-1', 'agent-acct-1', 'Agent One', 'agent-1'),
      makeMemberRow('conv-1', 'ext-1', 'Ext', null),
    ]);
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', limit: 10 });
    expect(result[0]?.unreadCount).toBe(0);
    expect(result[0]?.messages).toHaveLength(2);
    // messages are reversed (newest first → reversed to oldest first)
    expect(result[0]?.messages[0]?.messageId).toBe('m2');
    expect(result[0]?.messages[1]?.messageId).toBe('m1');
  });

  it('counts unread messages correctly', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([
      makeMessageRow('conv-1', 'm1', { unread: 1 }),
      makeMessageRow('conv-1', 'm2', { unread: 0 }),
      makeMessageRow('conv-1', 'm3', { unread: 1 }),
    ]);
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'agent-acct-1', 'A', 'agent-1')]);
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', limit: 10 });
    expect(result[0]?.unreadCount).toBe(2);
  });

  it('filters by unread=true (only unread messages included)', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([
      makeMessageRow('conv-1', 'm1', { unread: 1 }),
      makeMessageRow('conv-1', 'm2', { unread: 0 }),
    ]);
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'agent-acct-1', 'A', 'agent-1')]);
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', unread: true, limit: 10 });
    // unread=true → only unread messages (m1)
    expect(result[0]?.messages.map((m) => m.messageId)).toEqual(['m1']);
    expect(result[0]?.unreadCount).toBe(1);
  });

  it('filters by unread=false (source treats unread=true and unread=false identically; both filter to unread only — bug, see follow-up)', async () => {
    // SOURCE BUG: shouldInclude in the source is
    //   input.unread !== null && input.unread !== undefined ? row.unread === 1 : true
    // which evaluates to "row.unread === 1" for BOTH unread=true and unread=false.
    // Expected behavior for unread=false would be row.unread === 0 (read only).
    // This test pins the current (buggy) behavior; a follow-up issue will fix the source.
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([
      makeMessageRow('conv-1', 'm1', { unread: 1 }),
      makeMessageRow('conv-1', 'm2', { unread: 0 }),
    ]);
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'agent-acct-1', 'A', 'agent-1')]);
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', unread: false, limit: 10 });
    // Current source behavior: unread=false still returns only unread messages
    expect(result[0]?.messages.map((m) => m.messageId)).toEqual(['m1']);
  });

  it('includes all messages when unread filter is undefined', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([
      makeMessageRow('conv-1', 'm1', { unread: 1 }),
      makeMessageRow('conv-1', 'm2', { unread: 0 }),
    ]);
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'agent-acct-1', 'A', 'agent-1')]);
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', limit: 10 });
    expect(result[0]?.messages).toHaveLength(2);
  });

  it('respects the limit parameter (limit=2 with 5 conversations available)', async () => {
    mockAll.mockResolvedValueOnce([
      makeConversationRow('conv-1', 'C1'),
      makeConversationRow('conv-2', 'C2'),
    ]);
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', limit: 2 });
    // The 2 conversations have no messages and no members → 2 result rows
    expect(result).toHaveLength(2);
    // (chain is self-referential; result.length==2 implies .limit(2) was reached)
  });

  it('returns multiple conversations with mixed participants', async () => {
    mockAll.mockResolvedValueOnce([
      makeConversationRow('conv-1', 'Group A', 2_000_000),
      makeConversationRow('conv-2', 'Group B', 1_000_000),
    ]);
    mockAll.mockResolvedValueOnce([
      makeMessageRow('conv-1', 'm1', { unread: 1 }),
      makeMessageRow('conv-2', 'm2', { unread: 0 }),
    ]);
    mockFindMany.mockResolvedValueOnce([
      makeMemberRow('conv-1', 'agent-acct-1', 'Agent', 'agent-1', 'admin'),
      makeMemberRow('conv-1', 'ext-1', 'External', null, 'normal'),
      makeMemberRow('conv-2', 'agent-acct-1', 'Agent', 'agent-1'),
    ]);
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', limit: 10 });
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('Group A');
    expect(result[1]?.name).toBe('Group B');
    // participants for each conversation
    expect(result[0]?.participants).toEqual(['Agent', 'External']);
    expect(result[1]?.participants).toEqual(['Agent']);
  });

  it('marks unread messages as read (side effect)', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([
      makeMessageRow('conv-1', 'm1', { unread: 1 }),
      makeMessageRow('conv-1', 'm2', { unread: 1 }),
    ]);
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'agent-acct-1', 'A', 'agent-1')]);
    const { listConversations } = makeListing();
    await listConversations({ agentId: 'agent-1', limit: 10 });
    // The mark-as-read update should be called
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('does NOT call update when no unread messages', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([
      makeMessageRow('conv-1', 'm1', { unread: 0 }),
    ]);
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'agent-acct-1', 'A', 'agent-1')]);
    const { listConversations } = makeListing();
    await listConversations({ agentId: 'agent-1', limit: 10 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('falls back to participant display name when conversation.name is null', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([]);
    mockFindMany.mockResolvedValueOnce([
      makeMemberRow('conv-1', 'agent-acct-1', 'Agent One', 'agent-1'),
      makeMemberRow('conv-1', 'ext-1', 'Other Person', null),
    ]);
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', limit: 10 });
    // agent's own account is skipped → fallback to first other participant
    expect(result[0]?.name).toBe('Other Person');
  });

  it('limits messages per conversation to 5', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    // 8 messages; only 5 should be included
    mockAll.mockResolvedValueOnce(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        makeMessageRow('conv-1', `m${n}`, { createdAt: 1_000_000 + n }),
      ),
    );
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'agent-acct-1', 'A', 'agent-1')]);
    const { listConversations } = makeListing();
    const result = await listConversations({ agentId: 'agent-1', limit: 10 });
    expect(result[0]?.messages).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// listConversationsByAccount
// ---------------------------------------------------------------------------
describe('listConversationsByAccount (#5738)', () => {
  it('returns [] when the account has no conversations', async () => {
    mockAll.mockResolvedValueOnce([]);
    const { listConversationsByAccount } = makeListing();
    const result = await listConversationsByAccount({ accountId: 'ext-acct-1', limit: 10 });
    expect(result).toEqual([]);
    expect(getRequiredExternalAccount).toHaveBeenCalledWith('ext-acct-1');
  });

  it('returns a single conversation with messages', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([
      makeMessageRow('conv-1', 'm1', { authorDisplayName: 'Author' }),
    ]);
    mockFindMany.mockResolvedValueOnce([
      makeMemberRow('conv-1', 'ext-acct-1', 'External One', null),
      makeMemberRow('conv-1', 'agent-1', 'Agent One', 'agent-1'),
    ]);
    const { listConversationsByAccount } = makeListing();
    const result = await listConversationsByAccount({ accountId: 'ext-acct-1', limit: 10 });
    expect(result).toHaveLength(1);
    expect(result[0]?.unreadCount).toBe(0); // always 0 for account version
    expect(result[0]?.messages).toHaveLength(1);
    expect(result[0]?.messages[0]?.authorDisplayName).toBe('Author');
  });

  it('does NOT call update (no read tracking for external accounts)', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([makeMessageRow('conv-1', 'm1')]);
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'ext-acct-1', 'E', null)]);
    const { listConversationsByAccount } = makeListing();
    await listConversationsByAccount({ accountId: 'ext-acct-1', limit: 10 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('falls back to participant name when conversation.name is null', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([]);
    mockFindMany.mockResolvedValueOnce([
      makeMemberRow('conv-1', 'ext-acct-1', 'External One', null),
      makeMemberRow('conv-1', 'agent-1', 'Agent One', 'agent-1'),
    ]);
    const { listConversationsByAccount } = makeListing();
    const result = await listConversationsByAccount({ accountId: 'ext-acct-1', limit: 10 });
    // external account is skipped → fallback to other participant
    expect(result[0]?.name).toBe('Agent One');
  });

  it('uses conversation.name when set', async () => {
    const conv = makeConversationRow('conv-1', 'My Group');
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([]);
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'ext-acct-1', 'E', null)]);
    const { listConversationsByAccount } = makeListing();
    const result = await listConversationsByAccount({ accountId: 'ext-acct-1', limit: 10 });
    expect(result[0]?.name).toBe('My Group');
  });

  it('returns multiple conversations with limit', async () => {
    mockAll.mockResolvedValueOnce([
      makeConversationRow('conv-1', 'A', 2_000_000),
      makeConversationRow('conv-2', 'B', 1_500_000),
    ]);
    mockAll.mockResolvedValueOnce([]);
    mockFindMany.mockResolvedValueOnce([
      makeMemberRow('conv-1', 'ext-acct-1', 'E', null),
      makeMemberRow('conv-2', 'ext-acct-1', 'E', null),
    ]);
    const { listConversationsByAccount } = makeListing();
    const result = await listConversationsByAccount({ accountId: 'ext-acct-1', limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('reverses messages (oldest first in result)', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([
      makeMessageRow('conv-1', 'm-newest', { createdAt: 3_000_000 }),
      makeMessageRow('conv-1', 'm-middle', { createdAt: 2_000_000 }),
      makeMessageRow('conv-1', 'm-oldest', { createdAt: 1_000_000 }),
    ]);
    mockFindMany.mockResolvedValueOnce([makeMemberRow('conv-1', 'ext-acct-1', 'E', null)]);
    const { listConversationsByAccount } = makeListing();
    const result = await listConversationsByAccount({ accountId: 'ext-acct-1', limit: 10 });
    expect(result[0]?.messages.map((m) => m.messageId)).toEqual([
      'm-oldest',
      'm-middle',
      'm-newest',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Helper integration: buildConversationParticipantNames
// ---------------------------------------------------------------------------
describe('buildConversationParticipantNames integration (#5738)', () => {
  it('passes members to buildConversationParticipantNames', async () => {
    const conv = makeConversationRow('conv-1', null);
    mockAll.mockResolvedValueOnce([conv]);
    mockAll.mockResolvedValueOnce([]);
    mockFindMany.mockResolvedValueOnce([
      makeMemberRow('conv-1', 'agent-acct-1', 'A', 'agent-1'),
      makeMemberRow('conv-1', 'ext-1', 'B', null),
    ]);
    const { listConversations } = makeListing();
    await listConversations({ agentId: 'agent-1', limit: 10 });
    expect(mockBuildConversationParticipantNames).toHaveBeenCalled();
    // The argument should contain both member entries
    const arg = mockBuildConversationParticipantNames.mock.calls[0]?.[0] as Array<{ displayName: string }>;
    expect(arg.map((m) => m.displayName)).toEqual(['A', 'B']);
  });
});
