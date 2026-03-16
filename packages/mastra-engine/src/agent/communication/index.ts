/**
 * Communication Module - Public API
 *
 * Usage example:
 * ```ts
 * import { createCommunicationModule } from '@mastra-engine/core';
 *
 * const comModule = await createCommunicationModule({
 *   // Optional: provide custom client
 *   // client: myCustomClient,
 *   providers: [discordProvider, emailProvider],
 * });
 *
 * // Use the module
 * const conversations = await comModule.listConversations({
 *   limit: 10,
 * });
 * ```
 */

export { createCommunicationModule } from './module';
export { createCommunicationClient, getCommunicationClient } from './client';
export { initializeCommunicationDatabase } from './database';
export { createCommunicationStore } from './store';

export type { CommunicationProvider, CommunicationConversationView, CommunicationMessageView } from './provider-types';

export {
  communicationAccounts,
  communicationContacts,
  communicationContactAccounts,
  communicationConversations,
  communicationMessages,
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
} from './schema';

export type { Attachment } from './store';
