/**
 * Agent Skills Operations — extracted from write-ops.ts
 */

import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { jsonResponse, parseJsonBody } from '../../index';
import {
  installGlobalSkillsFromZip,
  deleteGlobalSkill,
  installGlobalSkillToAgentWorkspace,
  publishAgentWorkspaceSkillToGlobalCatalog,
} from '../../../../agents/global-skills';
import type { HttpHandler } from '../../../../http/server';
import type { Database } from '../../../../database/client';

import { adminRouteError } from '../admin-route-error-helper';

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
  db: Database,
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
        await publishAgentWorkspaceSkillToGlobalCatalog({
          workspaceBasePath,
          agent,
          skillName: body.skillName,
        });
        return jsonResponse({
          success: true,
          skillName: body.skillName,
        });
      } catch (err) {
        return adminRouteError(err, { path: '/admin/agent/skills/publish-to-global' });
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
        return adminRouteError(err, { path: '/admin/agent/skills/install-global' });
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
        return adminRouteError(err, { path: '/admin/agent/skills/upload' });
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
        return adminRouteError(err, { path: '/admin/agent/skills/delete' });
      }
    },
  });
}
