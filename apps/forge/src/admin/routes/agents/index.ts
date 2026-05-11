/**
 * Agent routes barrel — re-exports shared dependencies for _split/ files.
 * Ensures _split/ modules can import via '../index' (from agents/) rather than
 * fragile multi-level relative paths.
 */

export { agents, mcpServerConfigs, agentMcpConfigs } from '../../../database/schema';
