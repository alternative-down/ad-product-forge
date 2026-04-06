import type { RoleItem } from '@/lib/admin-api';

export const BASE_ROLE_TOOL_IDS = [
  'list_contacts',
  'get_contact',
  'upsert_contact',
  'list_conversations',
  'get_messages',
  'send_message',
  'list_self_crons',
  'manage_self_crons',
] as const;

export type RoleForm = {
  roleId?: string;
  name: string;
  description: string;
  toolIds: string[];
  workflowIds: string[];
};

export function createEmptyRoleForm(): RoleForm {
  return {
    name: '',
    description: '',
    toolIds: [...BASE_ROLE_TOOL_IDS],
    workflowIds: [],
  };
}

export function createRoleForm(role: RoleItem): RoleForm {
  return {
    roleId: role.roleId,
    name: role.name,
    description: role.description ?? '',
    toolIds: normalizeRoleFormToolIds(mergeBaseRoleToolIds(role.toolIds)),
    workflowIds: role.workflowIds,
  };
}

export function mergeBaseRoleToolIds(toolIds: string[]) {
  return [...new Set([...BASE_ROLE_TOOL_IDS, ...toolIds])].sort((left, right) => left.localeCompare(right));
}

export function normalizeRoleFormToolIds(toolIds: string[]) {
  const nextToolIds = [...toolIds];

  if (!nextToolIds.includes('change_agent_role')) {
    return nextToolIds;
  }

  return nextToolIds.filter((toolId) => toolId !== 'change_own_role');
}

export function groupToolIds(toolIds: string[]) {
  const sections = new Map<string, string[]>();
  const orderedSectionTitles = [
    'Pesquisa',
    'Comunicação',
    'Github',
    'Coolify',
    'Agenda & Tarefas',
    'Financeiro & Contratos',
    'Equipe & Papéis',
    'MiniMax',
    'Outras',
  ];

  for (const toolId of [...toolIds].sort((left, right) => left.localeCompare(right))) {
    const title = getToolSectionTitle(toolId);
    const items = sections.get(title) ?? [];
    items.push(toolId);
    sections.set(title, items);
  }

  return orderedSectionTitles
    .map((title) => ({
      title,
      toolIds: sections.get(title) ?? [],
    }))
    .filter((section) => section.toolIds.length > 0);
}

function getToolSectionTitle(toolId: string) {
  if (toolId.includes('search') || toolId.includes('memory')) {
    return 'Pesquisa';
  }

  if (toolId.includes('message') || toolId.includes('conversation') || toolId.includes('notification')) {
    return 'Comunicação';
  }

  if (toolId.includes('github')) {
    return 'Github';
  }

  if (toolId.includes('coolify')) {
    return 'Coolify';
  }

  if (toolId.includes('schedule') || toolId.includes('calendar') || toolId.includes('task') || toolId.includes('cron')) {
    return 'Agenda & Tarefas';
  }

  if (toolId.includes('finance') || toolId.includes('contract') || toolId.includes('invoice')) {
    return 'Financeiro & Contratos';
  }

  if (toolId.includes('role') || toolId.includes('agent') || toolId.includes('team')) {
    return 'Equipe & Papéis';
  }

  if (toolId.includes('minimax')) {
    return 'MiniMax';
  }

  return 'Outras';
}
