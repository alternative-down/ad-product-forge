/**
 * Agent Config Operations — extracted from write-ops.ts
 */

import { z as _z } from 'zod';
import { sql } from 'drizzle-orm';
import { forgeDebug } from '../../debug';
import { jsonResponse, parseJsonBody } from '../../index';
import { reloadAgentIfLoaded } from '../../../../capabilities/runtime';
import {
  updateAgentGitHubManifestConfigSchema,
  updateAgentConfigSchema,
} from '../../schemas/agents';
import type { HttpHandler } from '../../../../http/server';

export function registerConfigOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  db: any,
  input: {
    githubApps?: any;
    loaderConfig: any;
  },
) {
  // POST /admin/agent/github-manifest-config/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-manifest-config/update',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateAgentGitHubManifestConfigSchema);
        if (input.githubApps === null || input.githubApps === undefined) {
          return jsonResponse({ error: 'GitHub Apps not configured' }, 503);
        }
        const provisioning = await input.githubApps.updateAgentManifestConfig({
          agentId: body.agentId,
          manifestConfig: body.manifestConfig,
        });
        return jsonResponse({ success: true, agentId: body.agentId, provisioning });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: '/admin/agent/github-manifest-config/update route handler failed',
          context: {
            path: '/admin/agent/github-manifest-config/update',
            error: String(serializeError(err)),
          },
        });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });

  // POST /admin/agent/update-config
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/update-config',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateAgentConfigSchema);
        const agent = await db.query.agents.findFirst({
          where: sql`id = ${body.agentId}`,
        });
        if (agent === null || agent === undefined) {
          return jsonResponse({ error: 'Agent not found: ' + body.agentId }, 404);
        }
        await db
          .update(sql`agents`)
          .set({
            name: body.name,
            description: body.description ?? null,
            instructions: body.instructions,
            workspaceAutoSync: body.workspaceAutoSync === true ? 1 : 0,
            workspaceBm25: body.workspaceBm25 === true ? 1 : 0,
            modelProfileId: body.modelProfileId,
            omModelProfileId: body.omModelProfileId,
            updatedAt: Date.now(),
          })
          .where(sql`id = ${body.agentId}`);
        await reloadAgentIfLoaded(db, input.loaderConfig as any, body.agentId);
        return jsonResponse({ success: true, agentId: body.agentId });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: '/admin/agent/update-config route handler failed',
          context: { path: '/admin/agent/update-config', error: String(serializeError(err)) },
        });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });
}
import { serializeError } from '../../../../agents/agent-runner-error-formatting';
