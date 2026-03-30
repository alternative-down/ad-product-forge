// =============================================================================
// Tab/View Types
// =============================================================================

export type AgentDetailTab = 'runtime' | 'communications' | 'schedules' | 'history';
export type AgentRuntimeView = 'assignment' | 'configuration' | 'contract' | 'github';
export type AgentCommunicationView = 'inbox' | 'thread' | 'providers';

// =============================================================================
// Draft Types
// =============================================================================

export type ScheduleDraft = {
  mode: 'create' | 'edit';
  scheduleId?: string;
  name: string;
  description: string;
  scheduleType: 'cron' | 'date';
  cronExpression: string;
  scheduledDate: string;
  timezone: string;
  content: string;
  isActive: boolean;
};

export type HireAgentDraft = {
  hiringRequest: string;
  additionalContext: string;
  weeklyBudgetUsd: string;
};

export type AgentConfigDraft = {
  name: string;
  description: string;
  instructions: string;
  workspaceAutoSync: boolean;
  workspaceBm25: boolean;
  workspaceEmbedder: string;
  modelProfileId: string;
  omModelProfileId: string;
  lastMessages: number;
};

export type ProviderDraft = {
  providerType: 'discord' | 'email';
  credentialsText: string;
};
