/**
 * Typed Error subclasses for the agents/agent-runner-usage module (Pattern L, D51 #6502 batch 27).
 *
 * Replaces 2 raw `throw new Error(...)` calls (both with the same message) in
 * agent-runner-usage.ts with 1 typed Error subclass so consumers can use
 * `err instanceof XError` instead of parsing human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls at lines 61 and 153
 * of apps/forge/src/agents/agent-runner-usage.ts collapse to 1 typed Error
 * class. Both calls had the same message format
 * `Agent runtime is missing primary model profile: ${input.runtime.id}`, so a
 * single class fits both call sites. Message format is preserved verbatim for
 * backward compatibility with #6015 L#NN-46 transaction semantics.
 *
 * Pattern reference: apps/forge/src/agents/top-up-agent-contract.errors.ts (D51 batch 26).
 */

export class AgentRunnerMissingPrimaryModelProfileError extends Error {
  readonly code = 'AGENT_RUNNER_MISSING_PRIMARY_MODEL_PROFILE' as const;
  readonly runtimeId: string;
  constructor(runtimeId: string) {
    super(`Agent runtime is missing primary model profile: ${runtimeId}`);
    this.name = 'AgentRunnerMissingPrimaryModelProfileError';
    this.runtimeId = runtimeId;
  }
}
