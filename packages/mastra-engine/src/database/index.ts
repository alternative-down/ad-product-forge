/**
 * Database module exports - mastra-engine LIB
 *
 * Provides:
 * - Configuration helpers for libsql (getLibsqlUrl, getLibsqlToken)
 * - Path helpers for agent databases (getAgentDatabasePath)
 * - Migration runner (runMigrations) - used internally by communication module
 * - Communication schema and types
 *
 * NOTE: Database initialization is now handled by:
 * - packages/mastra-engine/src/agent/communication/database.ts
 */

export { runMigrations } from './migrate';
export {
  getLibsqlUrl,
  getLibsqlToken,
  getAgentDatabasePath,
  getCommunicationDatabasePath,
} from './config';
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
