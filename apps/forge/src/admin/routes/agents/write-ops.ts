/**
 * Agent Admin Write Operations - Phase 2 of #689
 * POST routes for agent operations extracted from routes.ts
 *
 * Sister file of operations.ts (#6519). Module-boundary type duplication
 * fix (#6520): consumer no longer defines narrow local interfaces that
 * shadow canonical producer types. All consumer-side types are imported
 * from their producer modules:
 *   - `AdminRouteContext` from `../routes` (canonical input shape)
 *   - `InternalAgentRegistry` from `../../../agents/internal-agent-registry`
 *   - `InternalChatService` from `../../../communication/internal-chat-service`
 *
 * The previous local `InternalChatService` interface had a buggy shape
 * (returned `{conversationKey, messageId}` directly instead of the canonical
 * `ToolResult<{...}>` wrapper). Migrating to the canonical type surfaces
 * any consumer that consumed the buggy shape — see call-site updates in
 * routes.ts.
 */

import type { HttpHandler } from '../../../http/server';
import type { AdminRouteContext } from '../../routes';
import type { InternalAgentRegistry } from '../../../agents/internal-agent-registry';
import type { loadAgent } from '../../../agents/agent-loader';
import type { topUpActiveAgentContract } from '../../../agents/top-up-agent-contract';
import type { adjustAgentContractBudget } from '../../../agents/adjust-agent-contract-budget';
import type { renewAgentContract } from '../../../agents/renew-agent-contract';
import type {
  runInternalHiring,
  runInternalTermination,
} from '../../../agents/internal-agent-lifecycle';
import type { changeAgentRoleFromAdmin } from '../../../capabilities/runtime';
import { registerLifecycleOps } from './_split/lifecycle-ops';
import { registerRoleOps } from './_split/role-ops';
import { registerLifecycleDelegateOps } from './_split/lifecycle-delegate-ops';
import { registerMcpOps } from './_split/mcp-ops';
import { registerSkillOps } from './_split/skill-ops';
import { registerConfigOps } from './_split/config-ops';
import { registerContractOps } from './_split/contract-ops';
import { registerProvidersOps } from './_split/providers-ops';

/**
 * Bundle of agent lifecycle/contract operations consumed by write-ops
 * split modules. Defined here as the canonical type for the producer
 * (routes.ts:165) and consumer (write-ops.ts + _split/*.ts). The function
 * shapes are derived from the producer-side exports so they propagate
 * automatically when producers evolve.
 */
export type AgentOperations = {
  loadAgent: typeof loadAgent;
  topUpActiveAgentContract: typeof topUpActiveAgentContract;
  adjustAgentContractBudget: typeof adjustAgentContractBudget;
  renewAgentContract: typeof renewAgentContract;
  runInternalHiring: typeof runInternalHiring;
  runInternalTermination: typeof runInternalTermination;
  changeAgentRoleFromAdmin: typeof changeAgentRoleFromAdmin;
};

/**
 * Register POST routes for agent write operations (reload, force-idle,
 * rewakeup, contracts, hire, terminate, roles, config, MCP, skills).
 *
 * The consumer uses canonical `AdminRouteContext`, `InternalAgentRegistry`,
 * and `AgentOperations` types so that producer signatures propagate here
 * automatically — eliminating the recurring module-boundary type drift
 * cycles (#6499, #6497, #6494, #6498, #6496, #6500). See #6519 (sister)
 * and #6520 (this file).
 */
export function registerAgentWriteOpsRoutes(
  httpServer: {
    registerRoute: (route: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      path: string;
      handler: HttpHandler;
    }) => void;
  },
  input: AdminRouteContext,
  registry: InternalAgentRegistry,
  ops: AgentOperations,
) {
  // Lifecycle ops — D54 #6631 Phase 2b v2: _split file upgraded to canonical
  // types (AgentLoaderConfig, InternalAgentRegistry Registry, typeof loadAgent).
  // No cast needed — direct pass-through.
  registerLifecycleOps(httpServer, input, { ...ops, registry });
  // Contract ops — D66 #6785: wire contract-ops (D65 split file already
  // implemented at _split/contract-ops.ts but was not registered here)
  registerContractOps({ httpServer, db: input.db, ops });
  // Providers ops — D66 #6785: new file _split/providers-ops.ts
  // Routes: /admin/agent/providers/upsert, /admin/agent/providers/delete
  registerProvidersOps(httpServer, input.db);
  // Lifecycle delegate ops — D54 #6631 Phase 2b v2: _split file upgraded to
  // canonical AgentOperations shape. No cast needed — direct pass-through.
  registerLifecycleDelegateOps(httpServer, input, ops);
  // MCP ops — extracted to split/mcp-ops.ts
  registerMcpOps(httpServer, input.db, input.loaderConfig);

  // Skill ops — extracted to split/skill-ops.ts
  registerSkillOps(httpServer, input.db, input);

  // Role ops — extracted to split/role-ops.ts
  registerRoleOps(httpServer, input.db);

  // Agent configuration and per-agent GitHub App lifecycle operations.
  registerConfigOps(httpServer, input.db, {
    githubApps: input.githubApps,
    loaderConfig: input.loaderConfig,
  });
}
