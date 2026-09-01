/**
 * Tests for Pattern L typed Errors in agents/agent-runner-usage module (D51 #6502 batch 27).
 *
 * Verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields (runtimeId) are exposed on the error for downstream consumers
 *
 * See apps/forge/src/agents/agent-runner-usage.errors.ts.
 */

import { describe, expect, it } from 'vitest';

import { AgentRunnerMissingPrimaryModelProfileError } from './agent-runner-usage.errors';

describe('agent-runner-usage — Pattern L typed Errors (D51 #6502 batch 27)', () => {
  it('AgentRunnerMissingPrimaryModelProfileError captures runtimeId and preserves message', () => {
    const runtimeId = 'runtime-abc';
    const error = new AgentRunnerMissingPrimaryModelProfileError(runtimeId);
    expect(error).toBeInstanceOf(AgentRunnerMissingPrimaryModelProfileError);
    expect(error.code).toBe('AGENT_RUNNER_MISSING_PRIMARY_MODEL_PROFILE');
    expect(error.runtimeId).toBe(runtimeId);
    expect(error.message).toBe(`Agent runtime is missing primary model profile: ${runtimeId}`);
  });
});
