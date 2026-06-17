/**
 * Agent Skills Admin Routes - extracted from routes.ts (#1519)
 * POST routes for agent skills management
 */

import type { ForgeHttpServerAdapter } from '../../../http/server';
import type { AdminRouteContext } from '../../routes';
import { reloadAgentIfLoaded } from '../../../capabilities/runtime';
import { eq } from 'drizzle-orm';
import {
  installGlobalSkillToAgentWorkspace,
  publishAgentWorkspaceSkillToGlobalCatalog,
} from '../../../agents/global-skills';
import {
  installAgentWorkspaceSkillsFromZip,
  deleteAgentWorkspaceSkill,
} from '../../../agents/workspace-skills';
import { parseJsonBody, jsonResponse } from '../index';
import { agents } from '../../../database/schema';
import {
  uploadAgentSkillsSchema,
  installGlobalSkillForAgentSchema,
  deleteAgentSkillSchema,
  publishAgentSkillToGlobalSchema,
} from '../schemas/skills';
import { adminRouteError } from './admin-route-error-helper';

export function registerAgentSkillsWriteRoutes(
  httpServer: ForgeHttpServerAdapter,
  input: {
    db: AdminRouteContext['db'];
    loaderConfig: AdminRouteContext['loaderConfig'];
    workspaceBasePath: string;
  },
) {
  // POST /admin/agent-skills/upload
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/upload',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, uploadAgentSkillsSchema);
        const agent = await input.db.query.agents.findFirst({
          where: eq(agents.id, body.agentId),
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

        return jsonResponse(
          {
            success: true,
            agentId: body.agentId,
            installedSkillNames,
          },
          201,
        );
      } catch (err) {
        return adminRouteError(err, { path: '/admin/agent-skills/upload' });
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
          where: eq(agents.id, body.agentId),
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
        return adminRouteError(err, { path: '/admin/agent-skills/delete' });
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
          where: eq(agents.id, body.agentId),
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
        return adminRouteError(err, { path: '/admin/agent-skills/install-global' });
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
          where: eq(agents.id, body.agentId),
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
        return adminRouteError(err, { path: '/admin/agent-skills/publish-global' });
      }
    },
  });
}
