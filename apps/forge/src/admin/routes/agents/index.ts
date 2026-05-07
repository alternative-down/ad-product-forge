/**
 * Agent Admin Routes - Phase 2 of #689
 * Routes extracted from routes.ts for better maintainability
 */

import {
  registerAgentReadRoutes,
  registerAgentOperationRoutes,
  registerAgentWriteOpsRoutes,
  registerAgentSkillsWriteRoutes,
  registerAgentSchedulesWriteRoutes,
} from './read';
// Fragmented agent detail routes (#1587)
import {
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