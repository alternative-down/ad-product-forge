import type { Tool } from '@mastra/core/tools';
import type { CommunicationModule } from './module';

import { createGetContactTool } from './tools/get-contact';
import { createGetMessagesTool } from './tools/get-messages';
import { createListContactsTool } from './tools/list-contacts';
import { createListConversationsTool } from './tools/list-conversations';
import { createSendMessageTool } from './tools/send-message';
import { createUpsertContactTool } from './tools/upsert-contact';

function canCreateTool(allowedToolIds: Set<string> | null | undefined, toolId: string) {
  return !allowedToolIds || allowedToolIds.has(toolId);
}

export function createExternalAccountTools(communication: CommunicationModule, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, unknown> = {};

  if (canCreateTool(allowedToolIds, 'list_contacts')) {
    tools.list_contacts = createListContactsTool(communication);
  }

  if (canCreateTool(allowedToolIds, 'get_contact')) {
    tools.get_contact = createGetContactTool(communication);
  }

  if (canCreateTool(allowedToolIds, 'upsert_contact')) {
    tools.upsert_contact = createUpsertContactTool(communication);
  }

  if (canCreateTool(allowedToolIds, 'list_conversations')) {
    tools.list_conversations = createListConversationsTool(communication);
  }

  if (canCreateTool(allowedToolIds, 'get_messages')) {
    tools.get_messages = createGetMessagesTool(communication);
  }

  if (canCreateTool(allowedToolIds, 'send_message')) {
    tools.send_message = createSendMessageTool(communication);
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
