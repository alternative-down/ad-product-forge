/**
 * Shared constants for agent context and working memory management.
 * Extracted to avoid duplication across agent-runner and agent-runner-context.
 */

/** Warning threshold for AGENT_CONTEXT.md size in characters. */
export const AGENT_CONTEXT_WARNING_CHAR_LIMIT = 8_000;

/** Warning threshold for working memory file size in characters. */
export const WORKING_MEMORY_WARNING_CHAR_LIMIT = 4_000;

/** Name of the agent context file in the workspace. */
export const AGENT_CONTEXT_FILE_PATH = 'AGENT_CONTEXT.md';
