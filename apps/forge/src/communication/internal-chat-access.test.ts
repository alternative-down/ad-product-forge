import { describe, expect, it, vi } from 'vitest';
import { createInternalChatAccess } from './internal-chat-access';
import { MessageNotFoundError, AttachmentNotFoundError, ExternalAccountNotFoundError, InternalChatAccountNotFoundError } from './internal-chat-errors';

const makeDb = () => {
  const query = {
    internalChatMessages: {
      findFirst: vi.fn(),
    },
  };
  return { query } as any;
};

describe('createInternalChatAccess', () => {
  // -------------------------------------------------------------------------
  // getMessageAttachmentByAccount
  // -------------------------------------------------------------------------

  describe('getMessageAttachmentByAccount', () => {
    it('returns attachment when membership ok and message/attachment exist', async () => {
      const db = makeDb();
      db.query.internalChatMessages.findFirst.mockResolvedValueOnce({ id: 'msg_1' });

      const deps = {
        requireConversationMembershipByAccount: vi.fn().mockResolvedValue(undefined),
        readMessageAttachment: vi.fn().mockResolvedValue('attachment-data'),
      };

      const { getMessageAttachmentByAccount } = createInternalChatAccess(db, deps);
      const result = await getMessageAttachmentByAccount({
        accountId: 'acc_1',
        conversationId: 'conv_1',
        messageId: 'msg_1',
        attachmentName: 'file.pdf',
      });

      expect(result).toBe('attachment-data');
      expect(deps.requireConversationMembershipByAccount).toHaveBeenCalledWith('acc_1', 'conv_1');
    });

    it('throws MessageNotFoundError when message does not exist', async () => {
      const db = makeDb();
      db.query.internalChatMessages.findFirst.mockResolvedValueOnce(null);

      const deps = {
        requireConversationMembershipByAccount: vi.fn().mockResolvedValue(undefined),
        readMessageAttachment: vi.fn(),
      };

      const { getMessageAttachmentByAccount } = createInternalChatAccess(db, deps);

      await expect(
        getMessageAttachmentByAccount({
          accountId: 'acc_1',
          conversationId: 'conv_1',
          messageId: 'msg_missing',
          attachmentName: 'file.pdf',
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });

    it('throws AttachmentNotFoundError when attachment not found', async () => {
      const db = makeDb();
      db.query.internalChatMessages.findFirst.mockResolvedValueOnce({ id: 'msg_1' });

      const deps = {
        requireConversationMembershipByAccount: vi.fn().mockResolvedValue(undefined),
        readMessageAttachment: vi.fn().mockResolvedValue(null),
      };

      const { getMessageAttachmentByAccount } = createInternalChatAccess(db, deps);

      await expect(
        getMessageAttachmentByAccount({
          accountId: 'acc_1',
          conversationId: 'conv_1',
          messageId: 'msg_1',
          attachmentName: 'missing.pdf',
        }),
      ).rejects.toThrow(AttachmentNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // getRequiredExternalAccount
  // -------------------------------------------------------------------------

  describe('getRequiredExternalAccount', () => {
    it('returns account when agentId is null (external account)', async () => {
      const deps = {
        getRequiredAccount: vi.fn().mockResolvedValue({
          id: 'acc_1',
          agentId: null,
          slug: 'alice',
          displayName: 'Alice',
        }),
      };
      const db = makeDb();
      const { getRequiredExternalAccount } = createInternalChatAccess(db, deps);

      const result = await getRequiredExternalAccount('acc_1');
      expect(result.id).toBe('acc_1');
    });

    it('throws ExternalAccountNotFoundError when agentId is set', async () => {
      const deps = {
        getRequiredAccount: vi.fn().mockResolvedValue({
          id: 'acc_1',
          agentId: 'agent_123',
          slug: 'bob',
          displayName: 'Bob Agent',
        }),
      };
      const db = makeDb();
      const { getRequiredExternalAccount } = createInternalChatAccess(db, deps);

      await expect(getRequiredExternalAccount('acc_1')).rejects.toThrow(ExternalAccountNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // getRequiredAccountBySlug
  // -------------------------------------------------------------------------

  describe('getRequiredAccountBySlug', () => {
    it('returns account when found by slug', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockResolvedValue({
          id: 'acc_1',
          agentId: null,
          slug: 'carol',
          displayName: 'Carol',
        }),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps);

      const result = await getRequiredAccountBySlug('carol');
      expect(result.slug).toBe('carol');
    });

    it('throws InternalChatAccountNotFoundError when slug not found', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockResolvedValue(null),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps);

      await expect(getRequiredAccountBySlug('unknown-slug')).rejects.toThrow(InternalChatAccountNotFoundError);
    });
  });


  // ─── Expanded: getRequiredExternalAccount ─────────────────────────────────

  describe('getRequiredExternalAccount (expanded)', () => {
    it('ExternalAccountNotFoundError includes the accountId', async () => {
      const deps = {
        getRequiredAccount: vi.fn().mockResolvedValue({
          id: 'acct-bot',
          agentId: 'agent-bot',
          slug: 'bot',
          displayName: 'Bot',
        }),
      };
      const db = makeDb();
      const { getRequiredExternalAccount } = createInternalChatAccess(db, deps);

      try {
        await getRequiredExternalAccount('acct-bot');
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as ExternalAccountNotFoundError).accountId).toBe('acct-bot');
      }
    });

    it('rethrows when getRequiredAccount throws', async () => {
      const deps = {
        getRequiredAccount: vi.fn().mockRejectedValue(new Error('db account not found')),
      };
      const db = makeDb();
      const { getRequiredExternalAccount } = createInternalChatAccess(db, deps);

      await expect(getRequiredExternalAccount('acct-1')).rejects.toThrow('db account not found');
    });
  });

  // ─── getRequiredAccountBySlug ─────────────────────────────────────────────

  describe('getRequiredAccountBySlug', () => {
    it('returns account when found by slug', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockResolvedValue({
          id: 'acct-1',
          agentId: null,
          slug: 'alice',
          displayName: 'Alice',
        }),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps);

      const result = await getRequiredAccountBySlug('alice');
      expect(result.slug).toBe('alice');
    });

    it('throws InternalChatAccountNotFoundError when account not found by slug', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockResolvedValue(null),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps);

      await expect(getRequiredAccountBySlug('nobody')).rejects.toThrow(InternalChatAccountNotFoundError);
    });

    it('InternalChatAccountNotFoundError includes the slug', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockResolvedValue(null),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps);

      try {
        await getRequiredAccountBySlug('missing-slug');
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as InternalChatAccountNotFoundError).slug).toBe('missing-slug');
      }
    });

    it('rethrows when getAccountBySlug throws', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockRejectedValue(new Error('db lookup failed')),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps);

      await expect(getRequiredAccountBySlug('alice')).rejects.toThrow('db lookup failed');
    });
  });

  // ─── Expanded: getMessageAttachmentByAccount ───────────────────────────────

  describe('getMessageAttachmentByAccount (expanded)', () => {
    it('throws when requireConversationMembershipByAccount throws', async () => {
      const deps = {
        requireConversationMembershipByAccount: vi.fn().mockRejectedValue(
          new Error('not a member'),
        ),
        readMessageAttachment: vi.fn(),
      };
      const db = makeDb();
      db.query.internalChatMessages.findFirst.mockResolvedValueOnce({ id: 'msg-1' });
      const { getMessageAttachmentByAccount } = createInternalChatAccess(db, deps);

      await expect(
        getMessageAttachmentByAccount({
          accountId: 'acct-1',
          conversationId: 'conv-1',
          messageId: 'msg-1',
          attachmentName: 'file.pdf',
        }),
      ).rejects.toThrow('not a member');

      expect(deps.requireConversationMembershipByAccount).toHaveBeenCalledWith(
        'acct-1',
        'conv-1',
      );
    });

    it('MessageNotFoundError includes the messageId', async () => {
      const deps = {
        requireConversationMembershipByAccount: vi.fn().mockResolvedValue(undefined),
        readMessageAttachment: vi.fn(),
      };
      const db = makeDb();
      db.query.internalChatMessages.findFirst.mockResolvedValueOnce(null);
      const { getMessageAttachmentByAccount } = createInternalChatAccess(db, deps);

      try {
        await getMessageAttachmentByAccount({
          accountId: 'acct-1',
          conversationId: 'conv-1',
          messageId: 'msg-xyz',
          attachmentName: 'file.pdf',
        });
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as MessageNotFoundError).messageId).toBe('msg-xyz');
      }
    });

    it('AttachmentNotFoundError includes the attachmentName', async () => {
      const deps = {
        requireConversationMembershipByAccount: vi.fn().mockResolvedValue(undefined),
        readMessageAttachment: vi.fn().mockResolvedValue(null),
      };
      const db = makeDb();
      db.query.internalChatMessages.findFirst.mockResolvedValueOnce({ id: 'msg-1' });
      const { getMessageAttachmentByAccount } = createInternalChatAccess(db, deps);

      try {
        await getMessageAttachmentByAccount({
          accountId: 'acct-1',
          conversationId: 'conv-1',
          messageId: 'msg-1',
          attachmentName: 'gone.pdf',
        });
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as AttachmentNotFoundError).attachmentName).toBe('gone.pdf');
      }
    });
  });
});
