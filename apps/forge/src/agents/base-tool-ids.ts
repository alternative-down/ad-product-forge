export const AGENT_BASE_TOOL_IDS = [
  'list_contacts',
  'upsert_contact',
  'list_conversations',
  'get_messages',
  'send_message',
  'list_self_crons',
  'manage_self_crons',
] as const;

export const AGENT_BASE_TOOL_ID_SET = new Set<string>(AGENT_BASE_TOOL_IDS);
