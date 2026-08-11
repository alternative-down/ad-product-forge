import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for agents/agent-runner-generate.ts.
 * Bakes in scope=agent-runner so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 6 forgeDebug call-sites in agent-runner-generate.ts all use scope=agent-runner
 *   - Helper co-located with other agent-runner-* files (future-proofing: shared scope
 *     across agent-runner-context-loaders/execute/generate/root can also import this)
 * L#NN-50 #50 LOG RETENTION discipline:
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *   - Original sites had runtimeId at top-level; spreading preserves
 *     this so log correlation by runtimeId continues to work
 *
 * Usage:
 *   agentRunnerDebug('error', 'generate failed', { runtimeId, error: errorMsg(err) });
 */
export function agentRunnerDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'agent-runner',
    level,
    message,
    ...context,
  });
}
