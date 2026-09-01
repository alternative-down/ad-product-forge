/**
 * Agent Lifecycle Delegate Operations — Phase 5 of write-ops.ts refactor
 * Routes: hire, terminate, change-role
 * Extracted from write-ops.ts (#2468)
 */

import { z } from 'zod';
import { jsonResponse, adminRoutesParseJsonBody } from '../../index';
import type { HttpHandler } from '../../../../http/server';
import type { Database } from '../../../../database/client';
import type { AgentEmailManager } from '../../../../email/migadu-manager';
import type { CoolifyManager } from '../../../../coolify/manager';
import type {
  runInternalHiring,
  runInternalTermination,
} from '../../../../agents/internal-agent-lifecycle';
import type { changeAgentRoleFromAdmin } from '../../../../capabilities/runtime';
import type { AgentLoaderConfig } from '../../../../agents/agent-loader-types';
import type { GitHubAppManager } from '../../../../github/manager';
import type { AgentScheduleManager } from '../../../../schedules/manager/manager';
import type { InternalChatService } from '../../../../communication/internal-chat-service';
import { safeRoute } from '../admin-route-error-helper';

// ─── Ops interface (D54 #6631 Phase 2b v2 — canonical AgentOperations) ────
// Mirrors AgentOperations from write-ops.ts. Declared locally to avoid circular
// import. Canonical signatures match — changeAgentRoleFromAdmin signature
// (1-arg input: { db, loaderConfig, targetAgentId, roleId }) was updated since
// this _split file was originally extracted.
interface Ops {
  runInternalHiring: typeof runInternalHiring;
  runInternalTermination: typeof runInternalTermination;
  changeAgentRoleFromAdmin: typeof changeAgentRoleFromAdmin;
}

export function registerLifecycleDelegateOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  input: {
    db: Database;
    workspaceBasePath: string;
    loaderConfig: AgentLoaderConfig;
    githubApps: GitHubAppManager;
    emailMailboxes: AgentEmailManager | null;
    coolify: CoolifyManager | null;
    schedules: AgentScheduleManager;
    internalChat: InternalChatService;
  },
  ops: Ops,
) {
  // POST /admin/agent/hire
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/hire',
    handler: safeRoute('/admin/agent/hire', async (request) => {
        const body = adminRoutesParseJsonBody(
          request.bodyText ?? '',
          z.object({
            hiringRequest: z.string(),
            additionalContext: z.string().optional(),
            weeklyBudgetUsd: z.number(),
          }),
        );
        const result = await ops.runInternalHiring(input.db, {
          hiringRequest: body.hiringRequest,
          additionalContext: body.additionalContext,
          weeklyBudgetUsd: body.weeklyBudgetUsd,
          workspaceBasePath: input.workspaceBasePath,
          githubApps: input.githubApps,
          emailMailboxes: input.emailMailboxes,
          coolify: input.coolify,
          schedules: input.schedules,
          internalChat: input.internalChat,
        });
        return jsonResponse(result, 201);
    }),
  });

  // POST /admin/agent/terminate
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/terminate',
    handler: safeRoute('/admin/agent/terminate', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, z.object({ agentId: z.string() }));
        return jsonResponse(
          await ops.runInternalTermination(input.db, {
            agentId: body.agentId,
            workspaceBasePath: input.workspaceBasePath,
            githubApps: input.githubApps,
            emailMailboxes: input.emailMailboxes,
            coolify: input.coolify,
            schedules: input.schedules,
            internalChat: input.internalChat,
          }),
        );
    }),
  });

  // POST /admin/agent/change-role
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/change-role',
    handler: safeRoute('/admin/agent/change-role', async (request) => {
        const body = adminRoutesParseJsonBody(
          request.bodyText ?? '',
          z.object({ agentId: z.string(), roleId: z.string() }),
        );
        await ops.changeAgentRoleFromAdmin({
          db: input.db,
          loaderConfig: input.loaderConfig,
          targetAgentId: body.agentId,
          roleId: body.roleId,
        });
        return jsonResponse({ success: true });
    }),
  });
}

// ─── Named type exports (D54 #6631 Phase 2b infrastructure) ────────────
// Exported for write-ops.ts to use as cast targets. Refactor-safe.
//
// Casts in write-ops.ts still require `as unknown as` — the local _split
// signatures use Record<string, unknown> / `unknown` (backward-compat).
// Future refactor: upgrade _split Ops to canonical AgentOperations shape
// (runInternalHiring, runInternalTermination, changeAgentRoleFromAdmin)
// AND update body code (changeAgentRoleFromAdmin canonical signature now
// takes 1 arg { db, loaderConfig, targetAgentId, roleId } not 2 args).
export type RegisterLifecycleDelegateOpsInput = Parameters<typeof registerLifecycleDelegateOps>[1];
export type RegisterLifecycleDelegateOpsOps = Parameters<typeof registerLifecycleDelegateOps>[2];
