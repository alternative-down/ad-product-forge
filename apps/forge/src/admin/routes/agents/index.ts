/**
 * Agent Admin Routes - Phase 2 of #689
 * Routes extracted from routes.ts for better maintainability
 */

export { registerAgentReadRoutes } from './read.js';
export { registerAgentOperationRoutes } from './operations.js';
export { registerAgentWriteOpsRoutes } from './write-ops.js';
// Fragmented agent detail routes (#1587)
export {
  registerAgentStepsRoutes,
  registerAgentConversationsRoutes,
  registerAgentMemoryRoutes,
  registerAgentMetricsRoutes,
  registerAgentContractRoutes,
  registerAgentMcpRoutes,
  registerAgentSchedulesRoutes,
  registerAgentNotificationsRoutes,
  registerAgentBaseRoutes,
} from './detail-read.js';
