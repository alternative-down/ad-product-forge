/**
 * Agent Admin Routes - Phase 2 of #689
 * Routes extracted from routes.ts for better maintainability
 */

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- public route registrar API, consumers depend on these names
export { registerAgentReadRoutes, registerAgentOperationRoutes, registerAgentWriteOpsRoutes, registerAgentSkillsWriteRoutes, registerAgentSchedulesWriteRoutes } from './read';
// Fragmented agent detail routes (#1587)
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- public route registrar API, consumers depend on these names
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