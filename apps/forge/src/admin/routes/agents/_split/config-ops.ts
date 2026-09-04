/**
 * Agent Config Operations — extracted from write-ops.ts
 */

import { z as _z } from 'zod';
import { sql } from 'drizzle-orm';
import { jsonResponse, adminRoutesParseJsonBody } from '../../index';
import { reloadAgentIfLoaded } from '../../../../capabilities/runtime';
import {
  agentGitHubAppActionSchema,
  updateAgentGitHubManifestConfigSchema,
  updateAgentConfigSchema,
} from '../../schemas/agents';
import type { HttpHandler } from '../../../../http/server';
import { agents } from '../../../../database/schema';
import type { Database } from '../../../../database/client';
import type { AgentLoaderConfig } from '../../../../agents/agent-loader';
import type { GitHubAppManager } from '../../../../github/manager';

import { safeRoute } from '../admin-route-error-helper';

export function registerConfigOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  db: Database,
  input: {
    githubApps?: GitHubAppManager | null;
    loaderConfig: AgentLoaderConfig;
  },
) {
  const requireGitHubApps = () => {
    if (!input.githubApps) {
      throw new Error('GitHub Apps not configured');
    }

    return input.githubApps;
  };

  async function loadAgentName(agentId: string) {
    const agent = await db.query.agents.findFirst({
      where: sql`id = ${agentId}`,
      columns: { name: true },
    });
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return agent.name;
  }

  // POST /admin/agent/github-manifest-config/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-manifest-config/update',
    handler: safeRoute('/admin/agent/github-manifest-config/update', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, updateAgentGitHubManifestConfigSchema);
        if (!input.githubApps) {
          return jsonResponse({ error: 'GitHub Apps not configured' }, 503);
        }
        const provisioning = await input.githubApps.updateAgentManifestConfig({
          agentId: body.agentId,
          manifestConfig: body.manifestConfig,
        });
        return jsonResponse({ success: true, agentId: body.agentId, provisioning });
    }),
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-app/create',
    handler: safeRoute('/admin/agent/github-app/create', async (request) => {
      const body = adminRoutesParseJsonBody(request.bodyText, agentGitHubAppActionSchema);
      const githubApps = requireGitHubApps();
      const agentName = await loadAgentName(body.agentId);
      const provisioning = await githubApps.createAgentApp({ agentId: body.agentId, agentName });
      return jsonResponse({ success: true, provisioning });
    }),
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-app/validate',
    handler: safeRoute('/admin/agent/github-app/validate', async (request) => {
      const body = adminRoutesParseJsonBody(request.bodyText, agentGitHubAppActionSchema);
      const credential = await requireGitHubApps().getGitCredentials({ agentId: body.agentId });
      return jsonResponse({ success: true, expiresAt: credential.expiresAt });
    }),
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-app/recreate',
    handler: safeRoute('/admin/agent/github-app/recreate', async (request) => {
      const body = adminRoutesParseJsonBody(request.bodyText, agentGitHubAppActionSchema);
      const githubApps = requireGitHubApps();
      const agentName = await loadAgentName(body.agentId);
      await githubApps.deleteAgentApp(body.agentId);
      const provisioning = await githubApps.createAgentApp({ agentId: body.agentId, agentName });
      return jsonResponse({ success: true, provisioning });
    }),
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-app/delete',
    handler: safeRoute('/admin/agent/github-app/delete', async (request) => {
      const body = adminRoutesParseJsonBody(request.bodyText, agentGitHubAppActionSchema);
      await requireGitHubApps().deleteAgentApp(body.agentId);
      return jsonResponse({ success: true });
    }),
  });

  // D66 #6785: Rotate credential for an existing GitHub App installation
  // without recreating the app. Complements recreate (which removes + creates)
  // by providing a cheaper credential-only refresh path.
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/github-app/rotate',
    handler: safeRoute('/admin/agent/github-app/rotate', async (request) => {
      const body = adminRoutesParseJsonBody(request.bodyText, agentGitHubAppActionSchema);
      const githubApps = requireGitHubApps();
      const credential = await githubApps.getGitCredentials({ agentId: body.agentId });
      return jsonResponse({ success: true, expiresAt: credential.expiresAt });
    }),
  });

  // POST /admin/agent/update-config
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/update-config',
    handler: safeRoute('/admin/agent/update-config', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, updateAgentConfigSchema);
        const agent = await db.query.agents.findFirst({
          where: sql`id = ${body.agentId}`,
        });
        if (!agent) {
          return jsonResponse({ error: 'Agent not found: ' + body.agentId }, 404);
        }
        await db
          .update(agents)
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
        await reloadAgentIfLoaded(db, input.loaderConfig, body.agentId);
        return jsonResponse({ success: true, agentId: body.agentId });
    }),
  });
}
