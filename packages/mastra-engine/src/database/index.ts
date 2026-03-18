/**
 * Database module exports - mastra-engine LIB
 *
 * Provides:
 * - Migration runner (runMigrations) - used internally by communication module
 * - Communication schema and types
 *
 * NOTE: Database initialization is now handled by:
 * - packages/mastra-engine/src/agent/communication/database.ts
 */

export { runMigrations } from './migrate';
export {
  communicationAccounts,
  communicationContacts,
  communicationContactAccounts,
  communicationConversations,
  communicationMessages,
  communicationContactsRelations,
  communicationContactAccountsRelations,
  communicationConversationsRelations,
  communicationMessagesRelations,
  type CommunicationAccount,
  type NewCommunicationAccount,
  type CommunicationContact,
  type NewCommunicationContact,
  type CommunicationContactAccount,
  type NewCommunicationContactAccount,
  type CommunicationConversation,
  type NewCommunicationConversation,
  type CommunicationMessage,
  type NewCommunicationMessage,
} from '../agent/communication/schema';
