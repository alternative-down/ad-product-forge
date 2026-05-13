import type { Database } from '../database/client';
import type { ConversationListingDeps } from './internal-chat-listing-types';
export type { ConversationListingDeps, ConversationParticipant, ConversationListItem, MessageListItem, MessageRowBase, MessageRowFull } from './internal-chat-listing-types';
import { createConversationListing } from './internal-chat-conversation-listing';
import { createMessageListing } from './internal-chat-message-listing';

export function createInternalChatListing(db: Database, deps: ConversationListingDeps) {
  const { listConversations, listConversationsByAccount } = createConversationListing(db, deps);
  const { getMessages, getMessagesByAccount } = createMessageListing(db, deps);

  return {
    listConversations,
    listConversationsByAccount,
    getMessages,
    getMessagesByAccount,
  };
}
