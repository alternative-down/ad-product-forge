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
});
