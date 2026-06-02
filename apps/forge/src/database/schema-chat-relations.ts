/**
 * Drizzle relations for schema-chat tables.
 *
 * Extracted from schema.ts in #5337 to colocate table definitions with their relations.
 */
import { relations } from 'drizzle-orm';

import {
  agents
} from './schema-agents.js';

import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageAttachments,
  internalChatMessageReads,
  internalChatMessages
} from './schema-chat.js';

export const internalChatAccountsRelations = relations(internalChatAccounts, ({ one }) => ({
  agent: one(agents, {
    fields: [internalChatAccounts.agentId],
    references: [agents.id],
  }),
}));


export const internalChatConversationsRelations = relations(
  internalChatConversations,
  ({ one, many }) => ({
    creator: one(internalChatAccounts, {
      fields: [internalChatConversations.createdByAccountId],
      references: [internalChatAccounts.id],
    }),
    members: many(internalChatConversationMembers),
    messages: many(internalChatMessages),
  }),
);


export const internalChatConversationMembersRelations = relations(
  internalChatConversationMembers,
  ({ one }) => ({
    conversation: one(internalChatConversations, {
      fields: [internalChatConversationMembers.conversationId],
      references: [internalChatConversations.id],
    }),
    account: one(internalChatAccounts, {
      fields: [internalChatConversationMembers.accountId],
      references: [internalChatAccounts.id],
    }),
  }),
);


export const internalChatMessagesRelations = relations(internalChatMessages, ({ one, many }) => ({
  conversation: one(internalChatConversations, {
    fields: [internalChatMessages.conversationId],
    references: [internalChatConversations.id],
  }),
  author: one(internalChatAccounts, {
    fields: [internalChatMessages.authorAccountId],
    references: [internalChatAccounts.id],
  }),
  attachments: many(internalChatMessageAttachments),
  reads: many(internalChatMessageReads),
}));


export const internalChatMessageReadsRelations = relations(internalChatMessageReads, ({ one }) => ({
  message: one(internalChatMessages, {
    fields: [internalChatMessageReads.messageId],
    references: [internalChatMessages.id],
  }),
  agent: one(agents, {
    fields: [internalChatMessageReads.agentId],
    references: [agents.id],
  }),
}));


export const internalChatMessageAttachmentsRelations = relations(
  internalChatMessageAttachments,
  ({ one }) => ({
    message: one(internalChatMessages, {
      fields: [internalChatMessageAttachments.messageId],
      references: [internalChatMessages.id],
    }),
  }),
);

