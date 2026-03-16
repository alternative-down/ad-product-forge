import { sqliteTable, text, integer, primaryKey, unique, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

/**
 * Stores communication accounts (self accounts)
 * Represents external accounts for communication providers
 */
export const communicationAccounts = sqliteTable('forge_communication_accounts', {
  accountId: text('account_id').primaryKey(),
  provider: text('provider').notNull(),
  externalAccountId: text('external_account_id').notNull(),
  displayName: text('display_name'),
  metadataJson: text('metadata_json'),
});

/**
 * Stores contacts (people we communicate with)
 */
export const communicationContacts = sqliteTable('forge_communication_contacts', {
  slug: text('slug').primaryKey(),
  displayName: text('display_name').notNull(),
  description: text('description'),
});

/**
 * Maps contacts to their external identities across different providers
 */
export const communicationContactAccounts = sqliteTable(
  'forge_communication_contact_accounts',
  {
    slug: text('slug').notNull(),
    provider: text('provider').notNull(),
    externalUserId: text('external_user_id'),
    username: text('username'),
  },
  (table) => {
    return {
      // UNIQUE constraint combining all fields
      uniqueContactAccountIdentity: unique().on(
        table.slug,
        table.provider,
        table.externalUserId,
        table.username,
      ),
      // Foreign key index
      contactSlugIdx: index('idx_contact_accounts_slug').on(table.slug),
    };
  },
);

/**
 * Stores conversations (threads of communication)
 */
export const communicationConversations = sqliteTable(
  'forge_communication_conversations',
  {
    conversationId: text('conversation_id').primaryKey(),
    provider: text('provider').notNull(),
    providerConversationKey: text('provider_conversation_key').notNull(),
    name: text('name'),
    contactSlug: text('contact_slug'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => {
    return {
      // UNIQUE constraint on provider + provider_conversation_key
      uniqueProviderConversationKey: unique().on(
        table.provider,
        table.providerConversationKey,
      ),
      // Index for filtering by provider
      providerIdx: index('idx_conversations_provider').on(table.provider),
      // Index for filtering by contact_slug
      contactSlugIdx: index('idx_conversations_contact_slug').on(table.contactSlug),
    };
  },
);

/**
 * Stores messages within conversations
 */
export const communicationMessages = sqliteTable(
  'forge_communication_messages',
  {
    messageId: text('message_id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    provider: text('provider').notNull(),
    providerMessageId: text('provider_message_id'),
    authorExternalId: text('author_external_id'),
    authorDisplayName: text('author_display_name'),
    authorUsername: text('author_username'),
    content: text('content').notNull(),
    attachmentsJson: text('attachments_json').notNull().default('[]'),
    unread: integer('unread').notNull().default(0),
    createdAt: text('created_at').notNull(),
    metadataJson: text('metadata_json'),
  },
  (table) => {
    return {
      // UNIQUE constraint on provider + provider_message_id (where provider_message_id is not null)
      uniqueProviderMessageId: unique().on(table.provider, table.providerMessageId),
      // Index for filtering by conversation_id
      conversationIdIdx: index('idx_messages_conversation_id').on(table.conversationId),
      // Index for filtering by provider
      providerIdx: index('idx_messages_provider').on(table.provider),
      // Index for filtering by unread status
      unreadIdx: index('idx_messages_unread').on(table.unread),
      // Index for ordering by created_at
      createdAtIdx: index('idx_messages_created_at').on(table.createdAt),
    };
  },
);

/**
 * Relations for type safety and convenience
 */
export const communicationContactsRelations = relations(
  communicationContacts,
  ({ many }) => ({
    accounts: many(communicationContactAccounts),
    conversations: many(communicationConversations),
  }),
);

export const communicationContactAccountsRelations = relations(
  communicationContactAccounts,
  ({ one }) => ({
    contact: one(communicationContacts, {
      fields: [communicationContactAccounts.slug],
      references: [communicationContacts.slug],
    }),
  }),
);

export const communicationConversationsRelations = relations(
  communicationConversations,
  ({ one, many }) => ({
    contact: one(communicationContacts, {
      fields: [communicationConversations.contactSlug],
      references: [communicationContacts.slug],
    }),
    messages: many(communicationMessages),
  }),
);

export const communicationMessagesRelations = relations(
  communicationMessages,
  ({ one }) => ({
    conversation: one(communicationConversations, {
      fields: [communicationMessages.conversationId],
      references: [communicationConversations.conversationId],
    }),
  }),
);

/**
 * Type definitions for TypeScript
 */
export type CommunicationAccount = typeof communicationAccounts.$inferSelect;
export type NewCommunicationAccount = typeof communicationAccounts.$inferInsert;

export type CommunicationContact = typeof communicationContacts.$inferSelect;
export type NewCommunicationContact = typeof communicationContacts.$inferInsert;

export type CommunicationContactAccount = typeof communicationContactAccounts.$inferSelect;
export type NewCommunicationContactAccount = typeof communicationContactAccounts.$inferInsert;

export type CommunicationConversation = typeof communicationConversations.$inferSelect;
export type NewCommunicationConversation = typeof communicationConversations.$inferInsert;

export type CommunicationMessage = typeof communicationMessages.$inferSelect;
export type NewCommunicationMessage = typeof communicationMessages.$inferInsert;
