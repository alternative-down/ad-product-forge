export type AgentRole = string;
export type AgentStatus = 'active' | 'paused' | 'archived';

export type AgentProfile = {
  agentId: string;
  slug: string;
  displayName: string;
  email?: string;
  persona?: string;
  role: AgentRole;
  systemPrompt?: string;
  defaultModel?: {
    provider: string;
    modelId: string;
  };
  status: AgentStatus;
  metadata?: Record<string, unknown>;
};
