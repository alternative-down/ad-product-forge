/**
 * Agent-specific constants — re-exported from the shared utils/constants module.
 * This module exists so existing imports from './constants' (relative to agents/)
 * keep working without changes.
 */
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- public API surface, consumers import from this path
export {
  AGENT_CONTEXT_FILE_PATH,
  AGENT_CONTEXT_WARNING_CHAR_LIMIT,
// fallow-ignore-next-line unused-export
  WORKING_MEMORY_WARNING_CHAR_LIMIT,
// fallow-ignore-next-line unused-export
  CONTEXT_DECORATION_TIMEOUT_MS,
// fallow-ignore-next-line unused-export
  RUNNER_AWAIT_TIMEOUT_MS,
// fallow-ignore-next-line unused-export
  STARTING_RUN_TIMEOUT_MS,
// fallow-ignore-next-line unused-export
  NO_ACTION_NEEDED_PREFIX,
// fallow-ignore-next-line unused-export
  STOP_AND_IDLE_PREFIX,
} from '../utils/constants';