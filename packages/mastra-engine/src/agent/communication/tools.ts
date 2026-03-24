import type { CommunicationModule } from './module';

import { createGetContactTool } from './tools/get-contact';
import { createGetMessagesTool } from './tools/get-messages';
import { createListContactsTool } from './tools/list-contacts';
import { createListConversationsTool } from './tools/list-conversations';
import { createSendMessageTool } from './tools/send-message';
import { createUpsertContactTool } from './tools/upsert-contact';
import { createChatGroupTool } from './tools/create-chat-group';
import { createAddMemberTool } from './tools/add-member-to-group';
import { createRemoveMemberTool } from './tools/remove-member-from-group';
import { createListChatGroupsTool } from './tools/list-chat-groups';
import { createListGroupMembersTool } from './tools/list-group-members';

export function createExternalAccountTools(communication: CommunicationModule) {
  return {
    list_contacts: createListContactsTool(communication),
    get_contact: createGetContactTool(communication),
    upsert_contact: createUpsertContactTool(communication),
    list_conversations: createListConversationsTool(communication),
    get_messages: createGetMessagesTool(communication),
    send_message: createSendMessageTool(communication),
    create_chat_group: createChatGroupTool(communication),
    add_member_to_group: createAddMemberTool(communication),
    remove_member_from_group: createRemoveMemberTool(communication),
    list_chat_groups: createListChatGroupsTool(communication),
    list_group_members: createListGroupMembersTool(communication),
  };
}
