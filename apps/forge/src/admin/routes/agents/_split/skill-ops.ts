/**
 * Agent Skills Operations — extracted from write-ops.ts
 */

import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { forgeDebug } from '../../debug';
import { jsonResponse, parseJsonBody } from '../../index';
import {
  installGlobalSkillsFromZip,
  deleteGlobalSkill,
  installGlobalSkillToAgentWorkspace,
  publishAgentWorkspaceSkillToGlobalCatalog,
} from '../../../../agents/global-skills';
import type { HttpHandler } from '../../../../http/server';

const publishAgentSkillToGlobalSchema = z
  .object({
    agentId: z.string(),
    skillName: z.string(),
  })
  .strict();

const installGlobalSkillForAgentSchema = z
  .object({
    agentId: z.string(),
    skillName: z.string(),
  })
  .strict();

const uploadAgentSkillsSchema = z
  .object({
    skillsZipBase64: z.string(),
  })
  .strict();

const deleteAgentSkillSchema = z
  .object({
    agentId: z.string(),
    skillName: z.string(),
  })
  .strict();

export function registerSkillOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  db: any,
  input: {
    workspaceBasePath: string;
  },
) {
  const workspaceBasePath = input.workspaceBasePath;

  // POST /admin/agent/skills/publish-to-global
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/publish-to-global',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, publishAgentSkillToGlobalSchema);
        const agent = await db.query.agents.findFirst({
          where: sql`id = ${body.agentId}`,
          columns: { id: true, workspaceFilesystem: true },
        });
        if (agent === null || agent === undefined)
          return jsonResponse({ error: 'Agent not found: ' + body.agentId }, 404);
        const result = await publishAgentWorkspaceSkillToGlobalCatalog({
          workspaceBasePath,
          agent,
          skillName: body.skillName,
        });
        return jsonResponse({
          success: true,
          skillName: body.skillName,
          destPath: (result as any).destPath,
        });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: '/admin/agent/skills/publish-to-global route handler failed',
          context: {
            path: '/admin/agent/skills/publish-to-global',
            error: err instanceof Error ? err.message : String(err),
          },
        });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent/skills/install-global
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/install-global',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, installGlobalSkillForAgentSchema);
        const agent = await db.query.agents.findFirst({
          where: sql`id = ${body.agentId}`,
          columns: { id: true, workspaceFilesystem: true },
        });
        if (agent === null || agent === undefined)
          return jsonResponse({ error: 'Agent not found: ' + body.agentId }, 404);
        await installGlobalSkillToAgentWorkspace({
          workspaceBasePath,
          agent,
          skillName: body.skillName,
        });
        return jsonResponse({ success: true, agentId: body.agentId, skillName: body.skillName });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: '/admin/agent/skills/install-global route handler failed',
          context: {
            path: '/admin/agent/skills/install-global',
            error: err instanceof Error ? err.message : String(err),
          },
        });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent/skills/upload
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/upload',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, uploadAgentSkillsSchema);
        const installedSkillNames = await installGlobalSkillsFromZip({
          workspaceBasePath,
          zipBase64: body.skillsZipBase64,
        });
        return jsonResponse({ success: true, skillNames: installedSkillNames });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: '/admin/agent/skills/upload route handler failed',
          context: {
            path: '/admin/agent/skills/upload',
            error: err instanceof Error ? err.message : String(err),
          },
        });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent/skills/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/skills/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentSkillSchema);
        await deleteGlobalSkill({ workspaceBasePath, skillName: body.skillName });
        return jsonResponse({ success: true, skillName: body.skillName });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: '/admin/agent/skills/delete route handler failed',
          context: {
            path: '/admin/agent/skills/delete',
            error: err instanceof Error ? err.message : String(err),
          },
        });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });
}
