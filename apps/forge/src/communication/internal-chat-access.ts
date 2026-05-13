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

  return { getRequiredExternalAccount, getRequiredAccountBySlug };
}
