/**
 * Typed Error subclasses for the agents/internal-agent-lifecycle module (Pattern L, D52 #6502 batch 35).
 */
export class InternalAgentLifecycleHiringError extends Error {
  readonly code = 'INTERNAL_AGENT_LIFECYCLE_HIRING' as const;
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = 'InternalAgentLifecycleHiringError';
    this.reason = reason;
  }
}
