export { initializeCommunicationDatabase } from './init';
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
