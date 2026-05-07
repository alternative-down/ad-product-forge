/**
 * Unit tests for communication/internal-chat-conversations.ts.
 * ensureDirectConversation and archiveConversationByAccount.
 * Extracted from #1555 refactor. Basic smoke tests from develop, full
 * functional coverage added in this PR.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createInternalChatConversations } from './internal-chat-conversations';

// ─── Shared mock DB factory ─────────────────────────────────────────────────

function makeMockDb(overrides?: {
  memberRows?: { conversationId: string; accountId: string }[];
  convRows?: { id: string; type: string; name: string | null }[];
  findFirstError?: Error;
  insertError?: Error;
}) {
  const memberRows = overrides?.memberRows ?? [];
  const convRows = overrides?.convRows ?? [];
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(memberRows),
      }),
    }),
    query: {
      internalChatConversations: {
        findFirst: vi.fn().mockImplementation(async () => {
          if (overrides?.findFirstError) throw overrides.findFirstError;
          return convRows[0] ?? null;
        }),
      },
      internalChatConversationMembers: {
        findMany: vi.fn().mockResolvedValue(memberRows),
      },
    },
    insert: vi.fn().mockImplementation(() => {
      if (overrides?.insertError) throw overrides.insertError;
      return { values: vi.fn().mockResolvedValue([{}]) };
    }),
    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    })),
  };
}

const LEFT = 'acct-left';
const RIGHT = 'acct-right';
const CONV_EXISTING = {
  id: 'conv-existing',
  type: 'dm' as const,
  name: null,
  createdByAccountId: LEFT,
  createdAt: 1000,
  updatedAt: 1000,
};

// ─── Smoke tests (from develop baseline) ─────────────────────────────────────

describe('createInternalChatConversations', () => {
  let conversations: ReturnType<typeof createInternalChatConversations>;
  let mockDb: ReturnType<typeof createMockDb>;

  function createMockDb() {
    const members: Array<{ conversationId: string; accountId: string }> = [];

    return {
      query: {
        internalChatConversationMembers: {
          findMany: vi.fn(async () => members),
        },
        internalChatConversations: {
          findFirst: vi.fn(async () => null),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
      })),
      insert: vi.fn(async () => {}),
      delete: vi.fn(() => ({
        where: vi.fn(async () => ({})),
      })),
      _members: members,
    };
  }

  beforeEach(() => {
    mockDb = createMockDb();
    conversations = createInternalChatConversations(mockDb as Parameters<typeof createInternalChatConversations>[0]);
  });

  it('has ensureDirectConversation method', () => {
    expect(typeof conversations.ensureDirectConversation).toBe('function');
  });

  it('has archiveConversationByAccount method', () => {
    expect(typeof conversations.archiveConversationByAccount).toBe('function');
  });

  it('archiveConversationByAccount calls getRequiredConversationForAccount before deleting', async () => {
    const getRequiredConversationForAccount = vi.fn(async () => ({ id: 'conv_1', type: 'dm' as const, name: null }));
    mockDb.query.internalChatConversationMembers.findMany = vi.fn(async () => []);
    mockDb.query.internalChatConversations.findFirst = vi.fn(async () => null);

    const result = await conversations.archiveConversationByAccount({
      accountId: 'acc_1',
      conversationId: 'conv_1',
      getRequiredConversationForAccount,
    });

    expect(getRequiredConversationForAccount).toHaveBeenCalledWith('acc_1', 'conv_1');
    expect(result).toEqual({ conversationId: 'conv_1', archived: true });
  });

  // ─── ensureDirectConversation — full coverage ─────────────────────────

  it('returns existing DM when a shared conversation already exists', async () => {
    const db = makeMockDb({
      memberRows: [
        { conversationId: 'conv-shared', accountId: LEFT },
        { conversationId: 'conv-shared', accountId: RIGHT },
      ],
      convRows: [CONV_EXISTING],
    });
    const convs = createInternalChatConversations(db as unknown as Parameters<typeof createInternalChatConversations>[0]);

    const result = await convs.ensureDirectConversation(LEFT, RIGHT);

    expect(result.id).toBe('conv-existing');
    expect(result.type).toBe('dm');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates a new DM conversation when no shared conversation exists', async () => {
    const db = makeMockDb({ memberRows: [] });
    const convs = createInternalChatConversations(db as unknown as Parameters<typeof createInternalChatConversations>[0]);

    await convs.ensureDirectConversation(LEFT, RIGHT);

    expect(db.insert).toHaveBeenCalled();
  });

  it('inserts two member records when creating new conversation', async () => {
    const db = makeMockDb({ memberRows: [] });
    const convs = createInternalChatConversations(db as unknown as Parameters<typeof createInternalChatConversations>[0]);

    await convs.ensureDirectConversation(LEFT, RIGHT);

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('throws when findFirst throws', async () => {
    const db = makeMockDb({
      memberRows: [
        { conversationId: 'conv-shared', accountId: LEFT },
        { conversationId: 'conv-shared', accountId: RIGHT },
      ],
      findFirstError: new Error('db findFirst failed'),
    });
    const convs = createInternalChatConversations(db as unknown as Parameters<typeof createInternalChatConversations>[0]);

    await expect(convs.ensureDirectConversation(LEFT, RIGHT)).rejects.toThrow('db findFirst failed');
  });

  it('throws when insert throws on conversation creation', async () => {
    const db = makeMockDb({
      memberRows: [],
      insertError: new Error('insert failed'),
    });
    const convs = createInternalChatConversations(db as unknown as Parameters<typeof createInternalChatConversations>[0]);

    await expect(convs.ensureDirectConversation(LEFT, RIGHT)).rejects.toThrow('insert failed');
  });

  // ─── archiveConversationByAccount — full coverage ──────────────────────

  it('deletes only membership when other members remain', async () => {
    const db = makeMockDb({
      memberRows: [
        { conversationId: 'conv-1', accountId: LEFT },
        { conversationId: 'conv-1', accountId: RIGHT },
      ],
    });
    const convs = createInternalChatConversations(db as unknown as Parameters<typeof createInternalChatConversations>[0]);

    await convs.archiveConversationByAccount({
      accountId: LEFT,
      conversationId: 'conv-1',
      getRequiredConversationForAccount: async () => ({ id: 'conv-1', type: 'dm', name: null }),
    });

    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it('deletes both membership and conversation when it becomes empty', async () => {
    const row = { conversationId: 'conv-1', accountId: LEFT };
    let deleteCount = 0;
    let findManyReturnsEmpty = false;
    const db = makeMockDb({ memberRows: [row] });
    db.query.internalChatConversationMembers.findMany = vi.fn<() => Promise<typeof row[]>>().mockImplementation(async () => {
      if (findManyReturnsEmpty) return [];
      return [row];
    });
    db.delete = vi.fn().mockImplementation((_table) => {
      deleteCount++;
      findManyReturnsEmpty = true;
      return { where: async () => ({ rowsAffected: 1 }) };
    });
    const convs = createInternalChatConversations(db as unknown as Parameters<typeof createInternalChatConversations>[0]);

    await convs.archiveConversationByAccount({
      accountId: LEFT,
      conversationId: 'conv-1',
      getRequiredConversationForAccount: async () => ({ id: 'conv-1', type: 'dm', name: null }),
    });

    expect(deleteCount).toBe(2);
  });
});