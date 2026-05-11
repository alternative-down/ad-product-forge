/**
 * Agent Hire Operations — Group 3 of 4
 * Routes: hire, terminate, change-role, github-manifest-config/update, update-config
 * Split from write-ops.ts (#2180)
 */

import { parseJsonBody, jsonResponse } from '../../index';
import { agents } from '../../../../src/database/schema';
import { eq } from 'drizzle-orm';
import {
  hireAgentSchema,
  terminateAgentSchema,
  changeAgentRoleSchema,
  updateAgentGitHubManifestConfigSchema,
  updateAgentConfigSchema,
} from '../../schemas/agents';

export interface HireOpsDeps {
  httpServer: { registerRoute: (route: object) => void };
  input: {
    db: unknown;
    workspaceBasePath: string;
    githubApps: unknown;
    emailMailboxes: unknown;
    coolify: unknown;
    schedules: unknown;
    internalChat: unknown;
    loaderConfig: unknown;
  };
  ops: {
    runInternalHiring: (db: unknown, opts: unknown) => Promise<unknown>;
    runInternalTermination: (db: unknown, opts: unknown) => Promise<unknown>;
    changeAgentRoleFromAdmin: (db: unknown, opts: unknown) => Promise<void>;
  };
}

type UpdateAgentManifestConfigFn = (opts: { agentId: string; manifestConfig: unknown }) => Promise<unknown>;

export function registerHireOps({ httpServer, input, ops }: HireOpsDeps) {
  // POST /admin/agent/hire
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/hire',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, hireAgentSchema);
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
    },
  });

  // POST /admin/agent/terminate
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/terminate',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, terminateAgentSchema);
      return jsonResponse(await ops.runInternalTermination(input.db, {
        agentId: body.agentId,
        workspaceBasePath: input.workspaceBasePath,
        githubApps: input.githubApps,
        emailMailboxes: input.emailMailboxes,
        coolify: input.coolify,
        schedules: input.schedules,
        internalChat: input.internalChat,
      }));
    },
  });

  // POST /admin/agent/change-role
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/change-role',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, changeAgentRoleSchema);
      await ops.changeAgentRoleFromAdmin(input.db, { agentId: body.agentId, roleId: body.roleId });
      return jsonResponse({ success: true });
    },
  });

  // POST /admin/agent/github-manifest-config/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-manifest-config/update',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, updateAgentGitHubManifestConfigSchema);
      if (input.githubApps === null || input.githubApps === undefined) {
        return jsonResponse({ error: 'GitHub Apps not configured' }, 503);
      }
      const provisioning = await (input.githubApps as UpdateAgentManifestConfigFn).updateAgentManifestConfig({
        agentId: body.agentId,
        manifestConfig: body.manifestConfig,
      });
      return jsonResponse({ success: true, agentId: body.agentId, provisioning });
    },
  });

  // POST /admin/agent/update-config
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/update-config',
    handler: async (request: { bodyText: string }) => {
      const body = parseJsonBody(request.bodyText, updateAgentConfigSchema);
      const db = input.db as { query: { agents: { findFirst: (opts: unknown) => Promise<unknown> } }; update: (table: unknown) => { set: (values: unknown) => { where: (condition: unknown) => Promise<unknown> }; where: (condition: unknown) => Promise<unknown> } };
      const agent = await db.query.agents.findFirst({
        where: eq(agents.agentId, body.agentId),
      });
      if (agent === null || agent === undefined) {
        return jsonResponse({ error: 'Agent not found' }, 404);
      }
      const updated = { ...agent, ...body.config };
      await db.update(agents).set(updated).where(eq(agents.agentId, body.agentId));
      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });
}