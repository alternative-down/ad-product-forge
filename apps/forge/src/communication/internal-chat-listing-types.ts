import { eq, inArray, sql } from 'drizzle-orm';
import {
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageAttachments,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type { Database } from '../database/client';
import { buildConversationParticipantNames } from './internal-chat-helpers';
import { forgeDebug } from '@forge-runtime/core';

// Named types to avoid complex inline generics exceeding TS parser limits
export type MessageRowBase = {
  messageId: string; unread: number; replyToMessageId: string | null;
  authorAccountId: string; authorDisplayName: string; content: string; createdAt: number;
};
export type MessageRowFull = MessageRowBase & { conversationId: string };
export interface MessageListItem {
  messageId: string; provider: string; authorId: string; targetKey: string;
  content: string; attachments: unknown[]; unread: boolean; createdAt: string;
  authorDisplayName: string; replyToMessageId: string | null;
}

// Partial deps for conversation-listing submodule
export type ConversationParticipant = {
  accountId: string; displayName: string; role: string; agentId: string | null; slug: string;
};
export interface ConversationListingDeps {
  getRequiredAgentAccount(agentId: string): Promise<{
    id: string; agentId: string | null; slug: string; displayName: string;
  }>;
  getRequiredExternalAccount(accountId: string): Promise<{
    id: string; agentId: string | null; slug: string; displayName: string;
  }>;
  listGroupMembersOrDmPeers(agentId: string, conversationId: string): Promise<ConversationParticipant[]>;
  listGroupMembersOrDmPeersByAccount(accountId: string, conversationId: string): Promise<ConversationParticipant[]>;
}

// Conversation result type (listConversations return)
export interface ConversationListItem {
  targetKey: string; provider: string; latestMessageAt: string; unreadCount: number;
  name: string; participants: string[];
  messages: MessageListItem[];
}

