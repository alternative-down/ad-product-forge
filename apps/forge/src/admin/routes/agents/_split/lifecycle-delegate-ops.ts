/**
 * Agent Lifecycle Delegate Operations — Phase 5 of write-ops.ts refactor
 * Routes: hire, terminate, change-role
 * Extracted from write-ops.ts (#2468)
 */

import { z } from 'zod';
import { forgeDebug } from '../../debug';
import { jsonResponse, parseJsonBody } from '../../index';
import type { HttpHandler } from '../../../../http/server';
import type { Database } from '../../../../database/client';
import type { AgentEmailManager } from '../../../../email/migadu-manager';
import type { CoolifyManager } from '../../../../coolify/manager';
import { errorMsg } from '../../../../agents/error-formatting';


export function registerLifecycleDelegateOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  input: {
    db: Database;
    workspaceBasePath: string;
    githubApps?: unknown;
    emailMailboxes?: AgentEmailManager | null;
    coolify?: CoolifyManager | null;
    schedules?: unknown;
    internalChat?: unknown;
  },
  ops: {
    runInternalHiring: (db: Database, opts: Record<string, unknown>) => Promise<{ agentId: string }>;
    runInternalTermination: (db: Database, opts: Record<string, unknown>) => Promise<{ agentId: string }>;
    changeAgentRoleFromAdmin: (opts: unknown, extra?: unknown) => Promise<void>;
  },
) {
  // POST /admin/agent/hire
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/hire',
    handler: async (request) => {
      try {
        const body = parseJsonBody(
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
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: '/admin/agent/hire route handler failed',
          context: { path: '/admin/agent/hire', error: errorMsg(err) },
        });
        return jsonResponse({ error: errorMsg(err) }, 500);
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
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: '/admin/agent/terminate route handler failed',
          context: { path: '/admin/agent/terminate', error: errorMsg(err) },
        });
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });

  // POST /admin/agent/change-role
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/change-role',
    handler: async (request) => {
      try {
        const body = parseJsonBody(
          request.bodyText ?? '',
          z.object({ agentId: z.string(), roleId: z.string() }),
        );
        await ops.changeAgentRoleFromAdmin(input.db, {
          agentId: body.agentId,
          roleId: body.roleId,
        });
        return jsonResponse({ success: true });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: '/admin/agent/change-role route handler failed',
          context: { path: '/admin/agent/change-role', error: errorMsg(err) },
        });
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });
}
