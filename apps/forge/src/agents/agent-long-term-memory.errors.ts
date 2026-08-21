/**
 * Typed Error subclasses for the agents/agent-long-term-memory module (Pattern L, D52 #6502 batch 26).
 *
 * Replaces 2 raw `throw new Error(...)` calls in agent-long-term-memory.ts with 2 typed
 * Error subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/agents/agent-long-term-memory.ts collapse to 2 typed Error classes.
 * Message format is preserved verbatim for backward compatibility.
 *
 * Pattern reference: apps/forge/src/communication/internal-chat-provider.errors.ts
 * (D52 batch 23 — Varek), apps/forge/src/finance/company-payables.errors.ts
 * (D52 batch 24 — Kaelen via Varek relay).
 */

export class LtmRuntimeSessionNotAvailableError extends Error {
  readonly code = 'LTM_RUNTIME_SESSION_NOT_AVAILABLE' as const;
  readonly agentId: string;

  constructor(agentId: string) {
    super(`LTM runtime session is not available for ${agentId}`);
    this.name = 'LtmRuntimeSessionNotAvailableError';
    this.agentId = agentId;
  }
}

export class LtmGenerateProducedNoResultError extends Error {
  readonly code = 'LTM_GENERATE_PRODUCED_NO_RESULT' as const;
  readonly agentId: string;

  constructor(agentId: string) {
    super(`LTM generate produced no result for ${agentId}`);
    this.name = 'LtmGenerateProducedNoResultError';
    this.agentId = agentId;
  }
}
