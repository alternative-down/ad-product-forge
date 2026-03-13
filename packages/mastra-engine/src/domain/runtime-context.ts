export type AgentRuntimeContext = {
  agentId: string;
  threadId: string;
  resourceId: string;
  workspacePath?: string;
  memoryWorkspacePath?: string;
  storageId?: string;
  vectorIndexNames?: string[];
  metadata?: Record<string, unknown>;
};
