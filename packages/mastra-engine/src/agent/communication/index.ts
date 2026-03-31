/**
 * Communication Module - Public API
 *
 * Usage example:
 * ```ts
 * import { createClient } from '@libsql/client';
 * import { createCommunicationModule } from '@mastra-engine/core';
 *
 * // 1. APP creates libSQL client
 * const client = createClient({
 *   url: 'file:./communication.db',
 * });
 *
 * // 2. Initialize communication module
 * const comModule = await createCommunicationModule({
 *   client,
 *   providers: [discordProvider, emailProvider],
 * });
 *
 * // 3. Use the module
 * const conversations = await comModule.listConversations({
 *   limit: 10,
 * });
 * ```
 */

export { createCommunicationModule } from './module';
export { createCommunicationStore } from './store';
export * as communicationSchema from './schema';

export type { CommunicationProvider, CommunicationConversationView, CommunicationMessageView } from './provider-types';

export {
  communicationAccounts,
  communicationContacts,
  communicationContactAccounts,
  communicationConversations,
  communicationMessages,
  chatGroupMembers,
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
  type ChatGroupMember,
  type NewChatGroupMember,
} from './schema';

export type { Attachment } from './store';
