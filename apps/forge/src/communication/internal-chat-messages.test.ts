/**
 * Unit tests for communication/internal-chat-messages.ts.
 * createInternalChatMessages — getMessages, getMessagesByAccount,
 * archiveConversationByAccount.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInternalChatMessages } from './internal-chat-messages';

// ─── Mock DB factory ─────────────────────────────────────────────────────────

function makeMockDb(
  overrides: {
    findManyRows?: unknown[];
    deleteRowsAffected?: number;
    deleteError?: Error;
  } = {},
) {
  const findManyRows = overrides.findManyRows ?? [];

  // Terminal node — all chain methods return it so the chain can continue
  // regardless of method call order (select, from, innerJoin, where, etc.)
  const terminal: Record<string, unknown> = {};
  terminal.orderBy = vi.fn().mockReturnValue(terminal);
  terminal.offset = vi.fn().mockReturnValue(terminal);
  terminal.limit = vi.fn().mockReturnValue(terminal);
  terminal.all = vi.fn().mockResolvedValue([]);
  terminal.where = vi.fn().mockReturnValue(terminal);
  terminal.from = vi.fn().mockReturnValue(terminal);
  terminal.innerJoin = vi.fn().mockReturnValue(terminal);

  let deleteCallCount = 0;
  const deleteChain: Record<string, unknown> = {};
  deleteChain.where = vi.fn().mockImplementation(async () => {
    deleteCallCount++;
    if (overrides.deleteError && deleteCallCount === 2) throw overrides.deleteError;
    return { rowsAffected: overrides.deleteRowsAffected ?? 1 };
  });
  deleteChain.set = vi.fn().mockReturnThis();

  const updateChain: Record<string, unknown> = {};
  updateChain.set = vi.fn().mockReturnThis();
  updateChain.where = vi.fn().mockResolvedValue({ rowsAffected: 0 });

  return {
    select: vi.fn().mockReturnValue(terminal),
    delete: vi.fn().mockReturnValue(deleteChain),
    update: vi.fn().mockReturnValue(updateChain),
    query: {
      internalChatConversationMembers: {
        findMany: vi.fn().mockResolvedValue(findManyRows),
      },
      internalChatConversations: {
        findFirst: vi.fn().mockResolvedValue({ id: 'conv-1', type: 'dm', name: null }),
      },
    },
  };
}

// ─── Mock deps factory ────────────────────────────────────────────────────────

function makeMockDeps(
  overrides: {
    requireConversationMembershipError?: Error;
    requireConversationMembershipByAccountError?: Error;
    getRequiredConversationForAccountError?: Error;
  } = {},
) {
  return {
    requireConversationMembership: vi.fn().mockImplementation(async () => {
      if (overrides.requireConversationMembershipError)
        throw overrides.requireConversationMembershipError;
    }),
    requireConversationMembershipByAccount: vi.fn().mockImplementation(async () => {
      if (overrides.requireConversationMembershipByAccountError)
        throw overrides.requireConversationMembershipByAccountError;
    }),
    getRequiredConversationForAccount: vi.fn().mockImplementation(async () => {
      if (overrides.getRequiredConversationForAccountError)
        throw overrides.getRequiredConversationForAccountError;
      return { id: 'conv-1', type: 'dm', name: null };
    }),
    readMessageAttachments: vi.fn().mockResolvedValue([]),
  };
}

// ─── getMessages guard ────────────────────────────────────────────────────────

describe('createInternalChatMessages — getMessages', () => {
  it('calls requireConversationMembership before querying', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps();
    const messages = createInternalChatMessages(db as never, deps);

    await messages.getMessages({
      agentId: 'agent-1',
      conversationKey: 'conv-1',
      limit: 20,
      offset: 0,
    });

    expect(deps.requireConversationMembership).toHaveBeenCalledWith('agent-1', 'conv-1');
  });

  it('throws when requireConversationMembership throws', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps({ requireConversationMembershipError: new Error('not a member') });
    const messages = createInternalChatMessages(db as never, deps);

    await expect(
      messages.getMessages({ agentId: 'agent-1', conversationKey: 'conv-1', limit: 20, offset: 0 }),
    ).rejects.toThrow('not a member');
  });
});

// ─── getMessagesByAccount guard ───────────────────────────────────────────────

describe('createInternalChatMessages — getMessagesByAccount', () => {
  it('calls requireConversationMembershipByAccount before querying', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps();
    const messages = createInternalChatMessages(db as never, deps);

    await messages.getMessagesByAccount({
      accountId: 'acc-1',
      conversationKey: 'conv-1',
      limit: 20,
      offset: 0,
    });

    expect(deps.requireConversationMembershipByAccount).toHaveBeenCalledWith('acc-1', 'conv-1');
  });

  it('throws when requireConversationMembershipByAccount throws', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps({
      requireConversationMembershipByAccountError: new Error('not a member'),
    });
    const messages = createInternalChatMessages(db as never, deps);

    await expect(
      messages.getMessagesByAccount({
        accountId: 'acc-1',
        conversationKey: 'conv-1',
        limit: 20,
        offset: 0,
      }),
    ).rejects.toThrow('not a member');
  });
});

// ─── archiveConversationByAccount ───────────────────────────────────────────

describe('createInternalChatMessages — archiveConversationByAccount', () => {
  it('calls getRequiredConversationForAccount before archiving', async () => {
    const db = makeMockDb({ findManyRows: [] });
    const deps = makeMockDeps();
    const messages = createInternalChatMessages(db as never, deps);

    await messages.archiveConversationByAccount({
      accountId: 'acc-1',
      conversationId: 'conv-1',
    });

    expect(deps.getRequiredConversationForAccount).toHaveBeenCalledWith('acc-1', 'conv-1');
  });

  it('throws when getRequiredConversationForAccount throws', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps({ getRequiredConversationForAccountError: new Error('not found') });
    const messages = createInternalChatMessages(db as never, deps);

    await expect(
      messages.archiveConversationByAccount({ accountId: 'acc-1', conversationId: 'conv-1' }),
    ).rejects.toThrow('not found');
  });

  it('deletes member from conversation and returns archived: true when members remain', async () => {
    const db = makeMockDb({ findManyRows: [{ conversationId: 'conv-1', accountId: 'acc-2' }] });
    const deps = makeMockDeps();
    const messages = createInternalChatMessages(db as never, deps);

    const result = await messages.archiveConversationByAccount({
      accountId: 'acc-1',
      conversationId: 'conv-1',
    });

    expect(result).toEqual({ conversationId: 'conv-1', archived: true });
    expect(db.delete).toHaveBeenCalled();
  });

  it('deletes both membership and conversation when last member is removed', async () => {
    const db = makeMockDb({ findManyRows: [] });
    const deps = makeMockDeps();
    const messages = createInternalChatMessages(db as never, deps);

    await messages.archiveConversationByAccount({
      accountId: 'acc-1',
      conversationId: 'conv-1',
    });

    expect(db.delete).toHaveBeenCalledTimes(2);
  });

  it('throws when findMany fails checking remaining members', async () => {
    const db = makeMockDb();
    db.query.internalChatConversationMembers.findMany = vi
      .fn()
      .mockRejectedValue(new Error('findMany failed'));
    const deps = makeMockDeps();
    const messages = createInternalChatMessages(db as never, deps);

    await expect(
      messages.archiveConversationByAccount({ accountId: 'acc-1', conversationId: 'conv-1' }),
    ).rejects.toThrow('findMany failed');
  });

  it('throws when conversation delete fails', async () => {
    const db = makeMockDb({ findManyRows: [], deleteError: new Error('delete failed') });
    const deps = makeMockDeps();
    const messages = createInternalChatMessages(db as never, deps);

    await expect(
      messages.archiveConversationByAccount({ accountId: 'acc-1', conversationId: 'conv-1' }),
    ).rejects.toThrow('delete failed');
  });
});
