import {
  blob,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { relations as _relations } from 'drizzle-orm';
import { InferModel } from 'drizzle-orm';
import { agents } from './schema-agents.js';

export const internalChatAccounts = sqliteTable(
  'forge_internal_chat_accounts',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    internalChatAccountsSlugIdx: uniqueIndex('forge_internal_chat_accounts_slug_idx').on(
      table.slug,
    ),
    internalChatAccountsAgentIdIdx: uniqueIndex('forge_internal_chat_accounts_agent_id_idx').on(
      table.agentId,
    ),
  }),
);

export type InternalChatAccount = InferModel<typeof internalChatAccounts>;
export type NewInternalChatAccount = InferModel<typeof internalChatAccounts, 'insert'>;

export const internalChatConversations = sqliteTable(
  'forge_internal_chat_conversations',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    name: text('name'),
    createdByAccountId: text('created_by_account_id').references(() => internalChatAccounts.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    internalChatConversationsTypeIdx: index('forge_internal_chat_conversations_type_idx').on(
      table.type,
    ),
    internalChatConversationsUpdatedAtIdx: index(
      'forge_internal_chat_conversations_updated_at_idx',
    ).on(table.updatedAt),
  }),
);

export type InternalChatConversation = InferModel<typeof internalChatConversations>;
export type NewInternalChatConversation = InferModel<typeof internalChatConversations, 'insert'>;

export const internalChatConversationMembers = sqliteTable(
  'forge_internal_chat_conversation_members',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => internalChatConversations.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => internalChatAccounts.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('normal'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    internalChatConversationMembersUniqueIdx: uniqueIndex(
      'forge_internal_chat_conversation_members_unique_idx',
    ).on(table.conversationId, table.accountId),
    internalChatConversationMembersAccountIdx: index(
      'forge_internal_chat_conversation_members_account_idx',
    ).on(table.accountId),
  }),
);

export type InternalChatConversationMember = InferModel<typeof internalChatConversationMembers>;
export type NewInternalChatConversationMember = InferModel<
  typeof internalChatConversationMembers,
  'insert'
>;

export const internalChatMessages = sqliteTable(
  'forge_internal_chat_messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => internalChatConversations.id, { onDelete: 'cascade' }),
    authorAccountId: text('author_account_id')
      .notNull()
      .references(() => internalChatAccounts.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    replyToMessageId: text('reply_to_message_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    internalChatMessagesConversationIdx: index('forge_internal_chat_messages_conversation_idx').on(
      table.conversationId,
    ),
    internalChatMessagesCreatedAtIdx: index('forge_internal_chat_messages_created_at_idx').on(
      table.createdAt,
    ),
    internalChatMessagesUpdatedAtIdx: index('internal_chat_messages_updated_at_idx').on(
      table.updatedAt,
    ),
  }),
);

export type InternalChatMessage = InferModel<typeof internalChatMessages>;
export type NewInternalChatMessage = InferModel<typeof internalChatMessages, 'insert'>;

export const internalChatMessageReads = sqliteTable(
  'forge_internal_chat_message_reads',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => internalChatMessages.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    readAt: integer('read_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    internalChatMessageReadsUniqueIdx: uniqueIndex(
      'forge_internal_chat_message_reads_unique_idx',
    ).on(table.messageId, table.agentId),
    internalChatMessageReadsAgentIdx: index('forge_internal_chat_message_reads_agent_idx').on(
      table.agentId,
    ),
    internalChatMessageReadsReadAtIdx: index('forge_internal_chat_message_reads_read_at_idx').on(
      table.readAt,
    ),
  }),
);

export type InternalChatMessageRead = InferModel<typeof internalChatMessageReads>;
export type NewInternalChatMessageRead = InferModel<typeof internalChatMessageReads, 'insert'>;

export const internalChatMessageAttachments = sqliteTable(
  'forge_internal_chat_message_attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => internalChatMessages.id, { onDelete: 'cascade' }),
    attachmentIndex: integer('attachment_index').notNull(),
    name: text('name').notNull(),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes').notNull(),
    data: blob('data', { mode: 'buffer' }).notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    internalChatMessageAttachmentsMessageIdx: index(
      'forge_internal_chat_message_attachments_message_idx',
    ).on(table.messageId),
    internalChatMessageAttachmentsUniqueIdx: uniqueIndex(
      'forge_internal_chat_message_attachments_unique_idx',
    ).on(table.messageId, table.attachmentIndex),
    internalChatMessageAttachmentsUpdatedAtIdx: index(
      'forge_internal_chat_message_attachments_updated_at_idx',
    ).on(table.updatedAt),
  }),
);

export type InternalChatMessageAttachment = InferModel<typeof internalChatMessageAttachments>;
export type NewInternalChatMessageAttachment = InferModel<
  typeof internalChatMessageAttachments,
  'insert'
>;