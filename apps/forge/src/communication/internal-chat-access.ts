import { and, eq } from 'drizzle-orm';
import {
  internalChatConversations,
  internalChatMessages,
} from '../database/schema';
import type { Database } from '../database/index';
import { forgeDebug } from '@forge-runtime/core';
import {
  MessageNotFoundError,
  AttachmentNotFoundError,
  ExternalAccountNotFoundError,
  InternalChatAccountNotFoundError,
} from './internal-chat-errors';

export interface InternalChatAccessDeps {
  getRequiredAccount(accountId: string): Promise<{
    id: string;
    agentId: string | null;
    slug: string;
    displayName: string;
  }>;
  getAccountBySlug(slug: string): Promise<{
    id: string;
    agentId: string | null;
    slug: string;
    displayName: string;
  } | null>;
  requireConversationMembershipByAccount(accountId: string, conversationId: string): Promise<void>;
  readMessageAttachment(messageId: string, attachmentName: string): Promise<string | null>;
}

export function createInternalChatAccess(db: Database, deps: InternalChatAccessDeps) {

  async function getMessageAttachmentByAccount(input: {
    accountId: string;
    conversationId: string;
    messageId: string;
    attachmentName: string;
  }) {
    try {
      await deps.requireConversationMembershipByAccount(input.accountId, input.conversationId);

      const message = await db.query.internalChatMessages.findFirst({
        where: and(
          eq(internalChatMessages.id, input.messageId),
          eq(internalChatMessages.conversationId, input.conversationId),
        ),
      });

      if (!message) {
        forgeDebug({ scope: 'internal-chat-access', level: 'warn', message: 'requireMessage: not found', context: { messageId: input.messageId } });
        throw new MessageNotFoundError(input.messageId);
      }

      const attachment = await deps.readMessageAttachment(input.messageId, input.attachmentName);

      if (!attachment) {
        forgeDebug({ scope: 'internal-chat-access', level: 'warn', message: 'requireAttachment: not found', context: { attachmentName: input.attachmentName } });
        throw new AttachmentNotFoundError(input.attachmentName);
      }

      return attachment;
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-access', level: 'error', message: '[internal-chat-access] getMessageAttachmentByAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getRequiredExternalAccount(accountId: string) {
    try {
      const account = await deps.getRequiredAccount(accountId);

      if (account.agentId) {
        forgeDebug({ scope: 'internal-chat-access', level: 'warn', message: 'requireExternalAccount: not found', context: { accountId } });
        throw new ExternalAccountNotFoundError(accountId, "External internal chat account not found");
      }

      return account;
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-access', level: 'error', message: '[internal-chat-access] getRequiredExternalAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getRequiredAccountBySlug(slug: string) {
    try {
      const account = await deps.getAccountBySlug(slug);

      if (!account) {
        forgeDebug({ scope: 'internal-chat-access', level: 'warn', message: 'requireInternalChatAccount: not found', context: { slug } });
        throw new InternalChatAccountNotFoundError(slug);
      }

      return account;
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-access', level: 'error', message: '[internal-chat-access] getRequiredAccountBySlug failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  return { getMessageAttachmentByAccount, getRequiredExternalAccount, getRequiredAccountBySlug };
}
