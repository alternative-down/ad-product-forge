import { forgeDebug } from '@forge-runtime/core';

/**
 * Shared debug helper for admin/read-model/* files.
 * Bakes in scope='admin-read-model' so call sites cannot typo the scope string.
 *
 * Originally extracted for admin/read-model/agents-detail.ts (D43 cycle 19).
 * Reused by admin/read-model/agents-runtime-memory.ts (D45 cycle 5) via Pattern M.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction) + L#NN-YYY v6 Pattern M
 * REUSE-EXISTING-SCOPE-HELPER (cross-file reuse when scope matches existing helper).
 *
 * L#NN-50 #50 LOG RETENTION discipline (D45 cycle 5):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *   - Matches agentRunnerDebug + ltmDebug contracts (L#NN-YYY v3 SEPARATE-FILE)
 *   - Allows log consumers to filter/scope by individual context fields directly
 *
 * Usage:
 *   adminReadModelDebug('info', 'listAgentContracts started');
 *   adminReadModelDebug('error', 'listAgentContracts failed', { agentId, error: errorMsg(err) });
 */
export function adminReadModelDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'admin-read-model',
    level,
    message,
    ...context,
  });
}
