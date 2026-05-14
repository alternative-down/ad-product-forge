import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageAttachments,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type {Database} from '../database/client'
import { buildConversationParticipantNames } from './internal-chat-helpers';
import { createInternalChatConversationListing } from './internal-chat-conversation-listing';
import { createInternalChatMessageRetrieval } from './internal-chat-message-retrieval';
import { forgeDebug } from '@forge-runtime/core';

async function withChatListingError<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    return await fn();
}

// =============================================================================
// ======================================================================
// Named types to avoid complex inline generics exceeding TS parser limits
type MessageRowBase = {
  messageId: string; unread: number; replyToMessageId: string | null;
  authorAccountId: string; authorDisplayName: string; content: string; createdAt: number;
};
type MessageRowFull = MessageRowBase & { conversationId: string };

interface MessageListItem {
  messageId: string; provider: string; authorId: string; targetKey: string;
  content: string; attachments: unknown[]; unread: boolean; createdAt: string;
  authorDisplayName: string; replyToMessageId: string | null;
}
interface MessageListItemWithConversation extends MessageListItem {
  conversationId: string;
}

export function createInternalChatListing(db: Database, deps: ConversationListingDeps) {

  const messageRetrieval = createInternalChatMessageRetrieval(db, {
    getRequiredAgentAccount: deps.getRequiredAgentAccount,
    getRequiredExternalAccount: deps.getRequiredExternalAccount,
  });

  const conversationListing = createInternalChatConversationListing(db, {
    getRequiredAgentAccount: deps.getRequiredAgentAccount,
    getRequiredExternalAccount: deps.getRequiredExternalAccount,
  });

  return {
    listConversations: conversationListing.listConversations,
    listConversationsByAccount: conversationListing.listConversationsByAccount,
    getMessages: messageRetrieval.getMessages,
    getMessagesByAccount: messageRetrieval.getMessagesByAccount,
  };
}