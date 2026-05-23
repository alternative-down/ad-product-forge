/**
 * Shared constants — single source of truth for cross-module limits and paths.
 */

export const AGENT_CONTEXT_FILE_PATH = 'AGENT_CONTEXT.md';
export const AGENT_CONTEXT_WARNING_CHAR_LIMIT = 8_000;

const _CONTEXT_DECORATION_TIMEOUT_MS = 5_000;
export const RUNNER_AWAIT_TIMEOUT_MS = 30_000;
const _STARTING_RUN_TIMEOUT_MS = RUNNER_AWAIT_TIMEOUT_MS * 2;

const _NO_ACTION_NEEDED_PREFIX = 'NO_ACTION_NEEDED';
const _STOP_AND_IDLE_PREFIX = 'STOP_AND_IDLE';

