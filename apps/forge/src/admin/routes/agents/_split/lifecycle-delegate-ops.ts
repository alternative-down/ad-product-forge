/**
 * Agent Lifecycle Delegate Operations — Phase 5 of write-ops.ts refactor
 * Routes: hire, terminate, change-role
 * Extracted from write-ops.ts (#2468)
 */

import { _z } from 'zod';
import { forgeDebug } from '../../debug';
import { jsonResponse, parseJsonBody } from '../../index';
import type { HttpHandler } from '../../../../http/server';

export function registerLifecycleDelegateOps(
  httpServer: { registerRoute: (route: { method: "POST"; path: string; handler: HttpHandler }) => void },
  input: {
    db: any;
    workspaceBasePath: string;
    githubApps?: any;
    emailMailboxes?: any;
    coolify?: any;
    schedules?: any;
    internalChat?: any;
  },
  ops: {
    runInternalHiring: (db: any, opts: any) => Promise<any>;
    runInternalTermination: (db: any, opts: any) => Promise<any>;
    changeAgentRoleFromAdmin: (db: any, opts: { agentId: string; roleId: string }) => Promise<void>;
  },
) {
  // POST /admin/agent/hire
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/hire',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, z.object({ hiringRequest: z.string(), additionalContext: z.string().optional(), weeklyBudgetUsd: z.number() }));
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
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/hire route handler failed', context: { path: '/admin/agent/hire', error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent/terminate
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/terminate',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, z.object({ agentId: z.string() }));
        return jsonResponse(await ops.runInternalTermination(input.db, {
          agentId: body.agentId,
          workspaceBasePath: input.workspaceBasePath,
          githubApps: input.githubApps,
          emailMailboxes: input.emailMailboxes,
          coolify: input.coolify,
          schedules: input.schedules,
          internalChat: input.internalChat,
        }));
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/terminate route handler failed', context: { path: '/admin/agent/terminate', error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent/change-role
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/change-role',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, z.object({ agentId: z.string(), roleId: z.string() }));
        await ops.changeAgentRoleFromAdmin(input.db, { agentId: body.agentId, roleId: body.roleId });
        return jsonResponse({ success: true });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/change-role route handler failed', context: { path: '/admin/agent/change-role', error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });
}