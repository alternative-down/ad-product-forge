import { describe, expect, it, vi } from 'vitest';
import { createInternalChatGuards } from './internal-chat-guards';
import { ConversationNotFoundError, ChatGroupNotFoundError } from './internal-chat-errors';

const makeDb = () => {
  const query = {
    internalChatConversationMembers: { findFirst: vi.fn() },
    internalChatConversations: { findFirst: vi.fn() },
  };
  return { query } as any;
};

describe('createInternalChatGuards', () => {
  // -------------------------------------------------------------------------
  // requireConversationMembership
  // -------------------------------------------------------------------------

  describe('requireConversationMembership', () => {
    it('resolves when membership exists for agent', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({
        accountId: 'acc_1',
      });
      const deps = {
        getRequiredAgentAccount: vi
          .fn()
          .mockResolvedValue({
            id: 'acc_1',
            agentId: 'agent_1',
            slug: 'alice',
            displayName: 'Alice',
          }),
      };
      const { requireConversationMembership } = createInternalChatGuards(db, deps);
      await expect(requireConversationMembership('agent_1', 'conv_1')).resolves.toBeUndefined();
    });

    it('throws ConversationNotFoundError when membership not found', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce(null);
      const deps = {
        getRequiredAgentAccount: vi
          .fn()
          .mockResolvedValue({
            id: 'acc_1',
            agentId: 'agent_1',
            slug: 'alice',
            displayName: 'Alice',
          }),
      };
      const { requireConversationMembership } = createInternalChatGuards(db, deps);
      await expect(requireConversationMembership('agent_1', 'conv_missing')).rejects.toThrow(
        ConversationNotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // requireConversationMembershipByAccount
  // -------------------------------------------------------------------------

  describe('requireConversationMembershipByAccount', () => {
    it('resolves when membership exists for account', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({
        accountId: 'acc_1',
      });
      const deps = { getRequiredAgentAccount: vi.fn() };
      const { requireConversationMembershipByAccount } = createInternalChatGuards(db, deps);
      await expect(
        requireConversationMembershipByAccount('acc_1', 'conv_1'),
      ).resolves.toBeUndefined();
    });

    it('throws ConversationNotFoundError when no membership', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce(null);
      const deps = { getRequiredAgentAccount: vi.fn() };
      const { requireConversationMembershipByAccount } = createInternalChatGuards(db, deps);
      await expect(requireConversationMembershipByAccount('acc_1', 'conv_missing')).rejects.toThrow(
        ConversationNotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // getRequiredConversationForAgent
  // -------------------------------------------------------------------------

  describe('getRequiredConversationForAgent', () => {
    it('returns conversation when membership and conversation exist', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({
        accountId: 'acc_1',
      });
      db.query.internalChatConversations.findFirst.mockResolvedValueOnce({
        id: 'conv_1',
        type: 'direct',
      });
      const deps = {
        getRequiredAgentAccount: vi
          .fn()
          .mockResolvedValue({
            id: 'acc_1',
            agentId: 'agent_1',
            slug: 'alice',
            displayName: 'Alice',
          }),
      };
      const { getRequiredConversationForAgent } = createInternalChatGuards(db, deps);
      const result = await getRequiredConversationForAgent('agent_1', 'conv_1');
      expect(result.id).toBe('conv_1');
    });

    it('throws ConversationNotFoundError when conversation not found', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({
        accountId: 'acc_1',
      });
      db.query.internalChatConversations.findFirst.mockResolvedValueOnce(null);
      const deps = {
        getRequiredAgentAccount: vi
          .fn()
          .mockResolvedValue({
            id: 'acc_1',
            agentId: 'agent_1',
            slug: 'alice',
            displayName: 'Alice',
          }),
      };
      const { getRequiredConversationForAgent } = createInternalChatGuards(db, deps);
      await expect(getRequiredConversationForAgent('agent_1', 'conv_missing')).rejects.toThrow(
        ConversationNotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // getRequiredConversationForAccount
  // -------------------------------------------------------------------------

  describe('getRequiredConversationForAccount', () => {
    it('returns conversation when membership and conversation exist', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({
        accountId: 'acc_1',
      });
      db.query.internalChatConversations.findFirst.mockResolvedValueOnce({
        id: 'conv_1',
        type: 'direct',
      });
      const deps = { getRequiredAgentAccount: vi.fn() };
      const { getRequiredConversationForAccount } = createInternalChatGuards(db, deps);
      const result = await getRequiredConversationForAccount('acc_1', 'conv_1');
      expect(result.id).toBe('conv_1');
    });
  });

  // -------------------------------------------------------------------------
  // getRequiredGroupForAgent
  // -------------------------------------------------------------------------

  describe('getRequiredGroupForAgent', () => {
    it('returns group when type is group', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({
        accountId: 'acc_1',
      });
      db.query.internalChatConversations.findFirst.mockResolvedValueOnce({
        id: 'grp_1',
        type: 'group',
      });
      const deps = {
        getRequiredAgentAccount: vi
          .fn()
          .mockResolvedValue({
            id: 'acc_1',
            agentId: 'agent_1',
            slug: 'alice',
            displayName: 'Alice',
          }),
      };
      const { getRequiredGroupForAgent } = createInternalChatGuards(db, deps);
      const result = await getRequiredGroupForAgent('agent_1', 'grp_1');
      expect(result.type).toBe('group');
    });

    it('throws ChatGroupNotFoundError when type is direct', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({
        accountId: 'acc_1',
      });
      db.query.internalChatConversations.findFirst.mockResolvedValueOnce({
        id: 'conv_1',
        type: 'direct',
      });
      const deps = {
        getRequiredAgentAccount: vi
          .fn()
          .mockResolvedValue({
            id: 'acc_1',
            agentId: 'agent_1',
            slug: 'alice',
            displayName: 'Alice',
          }),
      };
      const { getRequiredGroupForAgent } = createInternalChatGuards(db, deps);
      await expect(getRequiredGroupForAgent('agent_1', 'conv_1')).rejects.toThrow(
        ChatGroupNotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // getRequiredGroupForAccount
  // -------------------------------------------------------------------------

  describe('getRequiredGroupForAccount', () => {
    it('returns group when type is group', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({
        accountId: 'acc_1',
      });
      db.query.internalChatConversations.findFirst.mockResolvedValueOnce({
        id: 'grp_1',
        type: 'group',
      });
      const deps = { getRequiredAgentAccount: vi.fn() };
      const { getRequiredGroupForAccount } = createInternalChatGuards(db, deps);
      const result = await getRequiredGroupForAccount('acc_1', 'grp_1');
      expect(result.type).toBe('group');
    });

    it('throws ChatGroupNotFoundError when type is direct', async () => {
      const db = makeDb();
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({
        accountId: 'acc_1',
      });
      db.query.internalChatConversations.findFirst.mockResolvedValueOnce({
        id: 'conv_1',
        type: 'direct',
      });
      const deps = { getRequiredAgentAccount: vi.fn() };
      const { getRequiredGroupForAccount } = createInternalChatGuards(db, deps);
      await expect(getRequiredGroupForAccount('acc_1', 'conv_1')).rejects.toThrow(
        ChatGroupNotFoundError,
      );
    });
  });
});
