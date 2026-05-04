import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createInternalChatConversations } from './internal-chat-conversations';

describe('createInternalChatConversations', () => {
  let conversations: ReturnType<typeof createInternalChatConversations>;
  let mockDb: ReturnType<typeof createMockDb>;

  function createMockDb() {
    const accounts = new Map<string, { id: string; agentId: string | null; type: string; slug: string }>();
    const members = new Map<string, { conversationId: string; accountId: string; role: string }[]>();
    const conversations = new Map<string, { id: string; type: string; name: string | null }>();

    return {
      query: {
        internalChatAccounts: {
          findFirst: vi.fn(async ({ where }: { where: (row: unknown) => boolean }) => {
            for (const acc of accounts.values()) {
              if (where({ eq: () => true })) return acc;
            }
            return null;
          }),
        },
        internalChatConversationMembers: {
          findFirst: vi.fn(async () => null),
        },
        internalChatConversations: {
          findFirst: vi.fn(async () => null),
        },
      },
      _accounts: accounts,
      _members: members,
      _conversations: conversations,
      insert: vi.fn(),
      update: vi.fn(),
    };
  }

  beforeEach(() => {
    mockDb = createMockDb();
    conversations = createInternalChatConversations(mockDb as unknown as import('../database/index').Database);
  });

  it('has ensureDirectConversation method', () => {
    expect(typeof conversations.ensureDirectConversation).toBe('function');
  });

  it('has getRequiredExternalAccount method', () => {
    expect(typeof conversations.getRequiredExternalAccount).toBe('function');
  });

  it('has requireConversationMembership method', () => {
    expect(typeof conversations.requireConversationMembership).toBe('function');
  });

  it('has getRequiredConversationForAgent method', () => {
    expect(typeof conversations.getRequiredConversationForAgent).toBe('function');
  });
});