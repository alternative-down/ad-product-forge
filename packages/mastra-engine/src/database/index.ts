/**
 * Database module exports - mastra-engine LIB
 *
 * Provides:
 * - Configuration helpers for libsql (getLibsqlUrl, getLibsqlToken)
 * - Path helpers for agent databases (getAgentDatabasePath)
 * - Database initialization (initializeCommunicationDatabase)
 * - Migration runner (runMigrations)
 * - Communication schema and types
 */

export { initializeCommunicationDatabase } from './init';
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
