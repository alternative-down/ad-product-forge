/**
 * Logger helpers for agent-long-term-memory.ts.
 *
 * Centralizes the forgeDebug({scope: 'ltm', ...}) and
 * forgeDebug({scope: 'agent-ltm', ...}) call shapes so the scope string lives
 * in exactly one place per scope. Prefer ltmDebug() / ltmAgentWarn() over raw
 * forgeDebug() at LTM call sites: future scope renames touch one line here
 * instead of every call site in the file.
 */
import { forgeDebug } from '@forge-runtime/core';

export type LtmDebugLevel = 'debug' | 'info' | 'warn' | 'error';

export function ltmDebug(
  level: LtmDebugLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({ scope: 'ltm', level, message, context });
}

export function ltmAgentWarn(message: string): void {
  forgeDebug({ scope: 'agent-ltm', level: 'warn', message });
}
