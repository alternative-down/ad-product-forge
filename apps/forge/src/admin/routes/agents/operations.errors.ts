/**
 * Typed Error subclasses for the admin/routes/agents/operations module
 * (Pattern L, D52 #6502 batch 38).
 */
export class AgentOperationSendError extends Error {
  readonly code = 'AGENT_OPERATION_SEND_ERROR' as const;
  override readonly cause: string;
  constructor(cause: string) {
    super(cause);
    this.name = 'AgentOperationSendError';
    this.cause = cause;
  }
}
