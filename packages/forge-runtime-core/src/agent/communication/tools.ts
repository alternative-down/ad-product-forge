import type { CommunicationModule } from './module';

import { createGetMessagesTool } from './tools/get-messages';
import { createListContactsTool } from './tools/list-contacts';
import { createListConversationsTool } from './tools/list-conversations';
import { createSendMessageTool } from './tools/send-message';
import { createUpsertContactTool } from './tools/upsert-contact';

export function createExternalAccountTools(communication: CommunicationModule) {
  return {
    list_contacts: createListContactsTool(communication),
    upsert_contact: createUpsertContactTool(communication),
    list_conversations: createListConversationsTool(communication),
    get_messages: createGetMessagesTool(communication),
    send_message: createSendMessageTool(communication),
  };
}
