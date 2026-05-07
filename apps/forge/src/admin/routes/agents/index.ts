/**
 * Agent Admin Routes - Phase 2 of #689
 * Routes extracted from routes.ts for better maintainability
 */

export { registerAgentReadRoutes } from './read';
export { registerAgentOperationRoutes } from './operations';
export { registerAgentWriteOpsRoutes } from './write-ops';
export { registerAgentSkillsWriteRoutes } from './skills-write';
export { registerAgentSchedulesWriteRoutes } from './schedule-write';
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
} from './detail-read';