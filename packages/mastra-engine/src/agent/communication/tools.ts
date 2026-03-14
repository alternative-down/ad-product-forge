import { createGetContactTool } from './tools/get-contact';
import { createGetMessagesTool } from './tools/get-messages';
import { createListContactsTool } from './tools/list-contacts';
import { createListConversationsTool } from './tools/list-conversations';
import { createSendMessageTool } from './tools/send-message';
import { createUpsertContactTool } from './tools/upsert-contact';

export function createExternalAccountTools(agentId: string) {
  return {
    list_contacts: createListContactsTool(agentId),
    get_contact: createGetContactTool(agentId),
    upsert_contact: createUpsertContactTool(agentId),
    list_conversations: createListConversationsTool(agentId),
    get_messages: createGetMessagesTool(agentId),
    send_message: createSendMessageTool(agentId),
  };
}
