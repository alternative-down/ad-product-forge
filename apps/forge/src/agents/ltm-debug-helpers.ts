/**
 * Logger helpers for semantic recall call sites.
 *
 * Centralizes the forgeDebug({scope: 'ltm', ...}) and
 * forgeDebug({scope: 'agent-ltm', ...}) call shapes so the scope string lives
 * in exactly one place per scope. Prefer ltmDebug() / ltmAgentWarn() over raw
 * forgeDebug() at LTM call sites: future scope renames touch one line here
 * instead of every call site in the file.
 *
 * L#NN-50 #50 LOG RETENTION discipline (D45 cycle 4):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *   - Matches the agentRunnerDebug contract (L#NN-YYY v3 SEPARATE-FILE)
 *   - Allows log consumers to filter/scope by individual context fields directly
 *
 * Usage:
 *   ltmDebug('info', 'semantic recall started', {
 *     agentId: input.agentId,
 *     threadId: payload.threadId,
 *   });
 */
import { forgeDebug } from '@forge-runtime/core';

export type LtmDebugLevel = 'debug' | 'info' | 'warn' | 'error';

export function ltmDebug(
  level: LtmDebugLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({ scope: 'ltm', level, message, ...context });
}

export function ltmAgentWarn(message: string): void {
  forgeDebug({ scope: 'agent-ltm', level: 'warn', message });
}
