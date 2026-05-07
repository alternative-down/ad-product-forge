/**
 * Unit tests for communication/internal-chat-listing.ts.
 * createInternalChatListing — listConversations and listConversationsByAccount.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInternalChatListing } from './internal-chat-listing';
import type { ConversationListingDeps } from './internal-chat-listing';

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

function makeMockDb(convRows: unknown[] = [], messageRows: unknown[] = [], readRows: unknown[] = []) {
  // Build query chains manually (not using vi.fn() for chaining methods)
  const convAll = vi.fn().mockResolvedValue(convRows);
  const msgAll = vi.fn().mockResolvedValue(messageRows);

  // Conversation query chain: select().from().innerJoin().where().orderBy().limit().all()
  const convLimit = { all: convAll };
  const convOrderBy = { limit: vi.fn().mockReturnValue(convLimit), all: convAll };
  const convWhere = { orderBy: vi.fn().mockReturnValue(convOrderBy) };
  const convInnerJoin = {
    where: vi.fn().mockReturnValue(convWhere),
    limit: vi.fn().mockReturnValue(convLimit),
  };
  const convFrom = { from: vi.fn().mockReturnValue({ innerJoin: vi.fn().mockReturnValue(convInnerJoin) }) };

  // Message query chain: select().from().innerJoin().innerJoin().where().orderBy().all()
  const msgOrderBy = { all: msgAll };
  const msgWhere = { orderBy: vi.fn().mockReturnValue(msgOrderBy) };
  const msgInnerJoin2 = { where: vi.fn().mockReturnValue(msgWhere) };
  const msgInnerJoin1 = {
    where: vi.fn().mockReturnValue(convWhere),
    innerJoin: vi.fn().mockReturnValue(msgInnerJoin2),
    limit: vi.fn().mockReturnValue(convLimit),
  };
  const msgFrom = { from: vi.fn().mockReturnValue({ innerJoin: vi.fn().mockReturnValue(msgInnerJoin1) }) };

  let callCount = 0;
  const select = vi.fn().mockImplementation(() => {
    callCount++;
    return callCount === 1 ? convFrom : msgFrom;
  });

  return {
    select,
    query: {
      internalChatMessageReads: {
        findMany: vi.fn().mockResolvedValue(readRows),
      },
    },
  };
}

const DB = {} as Parameters<typeof createInternalChatListing>[0];

// ─── listConversationsByAccount ───────────────────────────────────────────────

describe('createInternalChatListing — listConversationsByAccount', () => {
  it('returns empty array when account has no conversations', async () => {
    const db = makeMockDb([]);
    const deps = makeMockDeps();
    const listing = createInternalChatListing(db as never, deps);

    const result = await listing.listConversationsByAccount({ accountId: 'acct-1', limit: 20 });

    expect(result).toEqual([]);
  });

  it('calls getRequiredExternalAccount before querying', async () => {
    const db = makeMockDb([]);
    const deps = makeMockDeps();
    const listing = createInternalChatListing(db as never, deps);

    await listing.listConversationsByAccount({ accountId: 'acct-1', limit: 20 });

    expect(deps.getRequiredExternalAccount).toHaveBeenCalledWith('acct-1');
  });

  it('calls db.select to fetch conversations for the account', async () => {
    const db = makeMockDb([]);
    const deps = makeMockDeps();
    const listing = createInternalChatListing(db as never, deps);

    await listing.listConversationsByAccount({ accountId: 'acct-1', limit: 20 });

    expect(db.select).toHaveBeenCalled();
  });

  it('returns enriched conversation with correct shape when conversations exist', async () => {
    const convRows = [
      { id: 'conv-1', name: 'Team Chat', type: 'group' as const, updatedAt: 1000 },
    ];
    const messageRows = [
      { conversationId: 'conv-1', id: 'msg-1', content: 'Hello', createdAt: 999, authorAccountId: 'acct-1', authorDisplayName: 'Alice' },
    ];
    const db = makeMockDb(convRows, messageRows);
    const deps = makeMockDeps({
      listGroupMembersOrDmPeersByAccount: vi.fn().mockResolvedValue([
        { accountId: 'acct-1', displayName: 'Alice', role: 'admin', agentId: null, slug: 'alice' },
        { accountId: 'acct-2', displayName: 'Bob', role: 'normal', agentId: null, slug: 'bob' },
      ]),
    });
    const listing = createInternalChatListing(db as never, deps);

    const result = await listing.listConversationsByAccount({ accountId: 'acct-1', limit: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      targetKey: 'conv-1',
      provider: 'internal-chat',
      name: 'Team Chat',
    });
    expect(result[0].participants).toContain('Bob');
  });

  it('derives conversation name from other participant when name is null', async () => {
    const convRows = [
      { id: 'conv-1', name: null, type: 'dm' as const, updatedAt: 1000 },
    ];
    const db = makeMockDb(convRows, []);
    const deps = makeMockDeps({
      listGroupMembersOrDmPeersByAccount: vi.fn().mockResolvedValue([
        { accountId: 'acct-1', displayName: 'Alice', role: 'admin', agentId: null, slug: 'alice' },
        { accountId: 'acct-2', displayName: 'Bob', role: 'normal', agentId: null, slug: 'bob' },
      ]),
    });
    const listing = createInternalChatListing(db as never, deps);

    const result = await listing.listConversationsByAccount({ accountId: 'acct-1', limit: 20 });

    expect(result[0].name).toBe('Bob');
  });
});

// ─── listConversations ───────────────────────────────────────────────────────

describe('createInternalChatListing — listConversations', () => {
  it('returns empty array when agent has no conversations', async () => {
    const db = makeMockDb([]);
    const deps = makeMockDeps();
    const listing = createInternalChatListing(db as never, deps);

    const result = await listing.listConversations({ agentId: 'agent-1', limit: 20 });

    expect(result).toEqual([]);
  });

  it('calls getRequiredAgentAccount to resolve agent to account', async () => {
    const db = makeMockDb([]);
    const deps = makeMockDeps();
    const listing = createInternalChatListing(db as never, deps);

    await listing.listConversations({ agentId: 'agent-1', limit: 20 });

    expect(deps.getRequiredAgentAccount).toHaveBeenCalledWith('agent-1');
  });

  it('returns enriched conversations with messages when conversations exist', async () => {
    const convRows = [
      { id: 'conv-1', name: 'Team', type: 'group' as const, updatedAt: 1000 },
    ];
    const messageRows = [
      { conversationId: 'conv-1', id: 'msg-1', content: 'Hello', createdAt: 999, authorAccountId: 'acct-2', authorDisplayName: 'Bob' },
    ];
    const db = makeMockDb(convRows, messageRows);
    const deps = makeMockDeps({
      listGroupMembersOrDmPeers: vi.fn().mockResolvedValue([
        { accountId: 'acct-1', displayName: 'Alice', role: 'admin', agentId: null, slug: 'alice' },
      ]),
    });
    const listing = createInternalChatListing(db as never, deps);

    const result = await listing.listConversations({ agentId: 'agent-1', limit: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      targetKey: 'conv-1',
      provider: 'internal-chat',
      name: 'Team',
    });
    expect(Array.isArray(result[0].messages)).toBe(true);
  });

  it('exposes both listConversations and listConversationsByAccount', () => {
    const db = makeMockDb();
    const deps = makeMockDeps();
    const listing = createInternalChatListing(db as never, deps);

    expect(typeof listing.listConversations).toBe('function');
    expect(typeof listing.listConversationsByAccount).toBe('function');
  });
});
