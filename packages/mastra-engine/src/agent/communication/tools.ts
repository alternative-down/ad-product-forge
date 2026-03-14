import type { createCommunicationModule } from './module';

import { createGetContactTool } from './tools/get-contact';
import { createGetMessagesTool } from './tools/get-messages';
import { createListContactsTool } from './tools/list-contacts';
import { createListConversationsTool } from './tools/list-conversations';
import { createSendMessageTool } from './tools/send-message';
import { createUpsertContactTool } from './tools/upsert-contact';

export function createExternalAccountTools(communication: ReturnType<typeof createCommunicationModule>) {
  return {
    list_contacts: createListContactsTool(communication),
    get_contact: createGetContactTool(communication),
    upsert_contact: createUpsertContactTool(communication),
    list_conversations: createListConversationsTool(communication),
    get_messages: createGetMessagesTool(communication),
    send_message: createSendMessageTool(communication),
  };
}
