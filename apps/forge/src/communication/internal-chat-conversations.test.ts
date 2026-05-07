import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createInternalChatConversations } from './internal-chat-conversations';

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
});
