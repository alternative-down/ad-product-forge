export const AGENT_BASE_TOOL_IDS = [
  'list_contacts',
  'get_contact',
  'upsert_contact',
  'list_conversations',
  'get_messages',
  'send_message',
  'list_agent_schedules',
  'create_agent_schedule',
  'update_agent_schedule',
  'delete_agent_schedule',
] as const;

export const AGENT_BASE_TOOL_ID_SET = new Set<string>(AGENT_BASE_TOOL_IDS);
