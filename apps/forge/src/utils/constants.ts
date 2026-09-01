/**
 * Shared constants — single source of truth for cross-module limits and paths.
 */
import { THIRTY_SECONDS_MS } from '../agents/time-constants';

export const AGENT_CONTEXT_FILE_PATH = 'AGENT_CONTEXT.md';
export const AGENT_CONTEXT_WARNING_CHAR_LIMIT = 8_000;

export const RUNNER_AWAIT_TIMEOUT_MS = THIRTY_SECONDS_MS;
