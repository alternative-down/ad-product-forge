import type { AgentDetail, AgentSchedule, CreateScheduleInput, UpdateScheduleInput } from '../../lib/api';
import type {
  AgentCommunicationView,
  AgentConfigDraft,
  AgentDetailTab,
  AgentRuntimeView,
  ScheduleDraft,
} from './types';

// =============================================================================
// Schedule Draft Utilities
// =============================================================================

export function createEmptyScheduleDraft(): ScheduleDraft {
  return {
    mode: 'create',
    name: '',
    description: '',
    scheduleType: 'cron',
    cronExpression: '0 9 * * 1-5',
    scheduledDate: '',
    timezone: 'UTC',
    content: '',
    isActive: true,
  };
}

export function createScheduleDraftFromRecord(schedule: AgentSchedule): ScheduleDraft {
  return {
    mode: 'edit',
    scheduleId: schedule.scheduleId,
    name: schedule.name,
    description: schedule.description ?? '',
    scheduleType: schedule.scheduleType,
    cronExpression: schedule.cronExpression ?? '',
    scheduledDate: schedule.scheduledDate ? toDateTimeLocalValue(schedule.scheduledDate) : '',
    timezone: schedule.timezone,
    content: schedule.content,
    isActive: schedule.isActive,
  };
}

export function toCreateScheduleInput(agentId: string, draft: ScheduleDraft): CreateScheduleInput {
  return {
    agentId,
    name: draft.name,
    description: draft.description || undefined,
    scheduleType: draft.scheduleType,
    cronExpression: draft.scheduleType === 'cron' ? draft.cronExpression : undefined,
    scheduledDate:
      draft.scheduleType === 'date' ? new Date(draft.scheduledDate).toISOString() : undefined,
    timezone: draft.timezone,
    content: draft.content,
  };
}

export function toUpdateScheduleInput(agentId: string, draft: ScheduleDraft): UpdateScheduleInput {
  return {
    agentId,
    scheduleId: draft.scheduleId!,
    name: draft.name,
    description: draft.description || null,
    scheduleType: draft.scheduleType,
    cronExpression: draft.scheduleType === 'cron' ? draft.cronExpression : null,
    scheduledDate:
      draft.scheduleType === 'date' ? new Date(draft.scheduledDate).toISOString() : null,
    timezone: draft.timezone,
    content: draft.content,
    isActive: draft.isActive,
  };
}

// =============================================================================
// Agent Config Draft Utilities
// =============================================================================

export function createAgentConfigDraft(agent: AgentDetail): AgentConfigDraft {
  return {
    name: agent.name,
    description: agent.description ?? '',
    instructions: agent.instructions,
    workspaceAutoSync: agent.workspace.autoSync,
    workspaceBm25: agent.workspace.bm25,
    workspaceEmbedder: agent.workspace.embedder,
    modelProfileId: agent.modelProfile?.profileId ?? '',
    omModelProfileId: agent.omModelProfile?.profileId ?? '',
  };
}

// =============================================================================
// Provider Draft Utilities
// =============================================================================

export function buildProviderDraftKey(agentId: string, providerType: 'discord' | 'email') {
  return `${agentId}:${providerType}`;
}

export function createProviderTemplate(providerType: 'discord' | 'email') {
  if (providerType === 'discord') {
    return '{\n  "token": "",\n  "allowedChannelIds": [],\n  "respondToMentionsOnly": false\n}';
  }

  return (
    '{\n' +
    '  "imap": {\n' +
    '    "host": "",\n' +
    '    "port": 993,\n' +
    '    "secure": true,\n' +
    '    "user": "",\n' +
    '    "password": ""\n' +
    '  },\n' +
    '  "smtp": {\n' +
    '    "host": "",\n' +
    '    "port": 465,\n' +
    '    "secure": true,\n' +
    '    "user": "",\n' +
    '    "password": ""\n' +
    '  }\n' +
    '}'
  );
}

// =============================================================================
// Formatting Utilities
// =============================================================================

export function toDateTimeLocalValue(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toPrettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function formatDateTimeText(value?: string | number | null) {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// =============================================================================
// Navigation Utilities
// =============================================================================

export function buildAgentLocation(input: {
  agentId?: string;
  tab?: AgentDetailTab;
  runtimeView?: AgentRuntimeView;
  communicationView?: AgentCommunicationView;
}): string {
  const parts = ['/agents'];
  if (input.agentId) {
    parts.push(input.agentId);
    if (input.tab) {
      parts.push(input.tab);
      if (input.tab === 'runtime' && input.runtimeView) {
        parts.push(input.runtimeView);
      }
      if (input.tab === 'communications' && input.communicationView) {
        parts.push(input.communicationView);
      }
    }
  }
  return parts.join('/');
}
