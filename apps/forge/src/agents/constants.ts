/**
 * Agent-specific constants — re-exported from the shared utils/constants module.
 * This module exists so existing imports from './constants' (relative to agents/)
 * keep working without changes.
 */
export {
  AGENT_CONTEXT_FILE_PATH,
  AGENT_CONTEXT_WARNING_CHAR_LIMIT,
  WORKING_MEMORY_WARNING_CHAR_LIMIT,
  CONTEXT_DECORATION_TIMEOUT_MS,
  RUNNER_AWAIT_TIMEOUT_MS,
  STARTING_RUN_TIMEOUT_MS,
  NO_ACTION_NEEDED_PREFIX,
  STOP_AND_IDLE_PREFIX,
} from '../utils/constants';
