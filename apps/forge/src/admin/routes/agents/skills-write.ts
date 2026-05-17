/**
 * Agent Skills Admin Routes - extracted from routes.ts (#1519)
 * POST routes for agent skills management
 */

import type { ForgeHttpServerAdapter, HttpHandler } from '../../../http/server';
import type { AdminRouteContext } from '../../routes';
import { forgeDebug } from '../debug';
import { reloadAgentIfLoaded } from '../../../capabilities/runtime';
import { eq } from 'drizzle-orm';
import {
  installAgentWorkspaceSkillsFromZip,
  deleteAgentWorkspaceSkill,
  installGlobalSkillToAgentWorkspace,
  publishAgentWorkspaceSkillToGlobalCatalog,
} from '../../../agents/global-skills';
import { parseJsonBody, jsonResponse } from '../index';
import {
  uploadAgentSkillsSchema,
  deleteAgentSkillSchema,
  installGlobalSkillForAgentSchema,
  publishAgentSkillToGlobalSchema,
} from '../schemas/skills';

export function registerAgentSkillsWriteRoutes(
  httpServer: ForgeHttpServerAdapter,
  input: { db: AdminRouteContext['db']; loaderConfig: AdminRouteContext['loaderConfig']; workspaceBasePath: string },
) {
  // POST /admin/agent-skills/upload
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/upload',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, uploadAgentSkillsSchema);
        const agent = await input.db.query.agents.findFirst({
          where: eq((input.db.query.agents as any).id, body.agentId),
        });

        if (!agent) {
          return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
        }

        const installedSkillNames = await installAgentWorkspaceSkillsFromZip({
          workspaceBasePath: input.workspaceBasePath,
          agent,
          zipBase64: body.archiveBase64,
        });

        await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          installedSkillNames,
        }, 201);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/agent-skills/upload', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent-skills/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentSkillSchema);
        const agent = await input.db.query.agents.findFirst({
          where: eq((input.db.query.agents as any).id, body.agentId),
        });

        if (!agent) {
          return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
        }

        await deleteAgentWorkspaceSkill({
          workspaceBasePath: input.workspaceBasePath,
          agent,
          skillName: body.skillName,
        });

        await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          skillName: body.skillName,
        });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/agent-skills/delete', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent-skills/install-global
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/install-global',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, installGlobalSkillForAgentSchema);
        const agent = await input.db.query.agents.findFirst({
          where: eq((input.db.query.agents as any).id, body.agentId),
        });

        if (!agent) {
          return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
        }

        await installGlobalSkillToAgentWorkspace({
          workspaceBasePath: input.workspaceBasePath,
          agent,
          skillName: body.skillName,
        });

        await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          skillName: body.skillName,
        });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/agent-skills/install-global', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent-skills/publish-global
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/publish-global',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, publishAgentSkillToGlobalSchema);
        const agent = await input.db.query.agents.findFirst({
          where: eq((input.db.query.agents as any).id, body.agentId),
        });

        if (!agent) {
          return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
        }

        const publishedSkillName = await publishAgentWorkspaceSkillToGlobalCatalog({
          workspaceBasePath: input.workspaceBasePath,
          agent,
          skillName: body.skillName,
        });

        await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          publishedSkillName,
        });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/agent-skills/publish-global', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });
}