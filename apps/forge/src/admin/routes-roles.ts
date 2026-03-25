import { z } from 'zod';

import type { Database } from '../database/index';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import type { AdminReadModel } from './read-model';
import type { createForgeHttpServer } from '../http/server';
import { createCapabilityStore } from '../capabilities/store';
import { reloadAgentsForRole } from '../capabilities/runtime';

type AdminRoutesInput = {
  db: Database;
  httpServer: ReturnType<typeof createForgeHttpServer>;
  loaderConfig: AgentLoaderConfig;
  workspaceBasePath: string;
  schedules: object;
  integrations: object;
  emailMailboxes: object | null;
  coolify: object | null;
  githubApps: object;
};

// Schemas
const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

const deleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseJsonBody<T>(bodyText: string, schema: z.ZodType<T>): T {
  try {
    const parsed = JSON.parse(bodyText);
    return schema.parse(parsed);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export function registerRoleRoutes(input: AdminRoutesInput, readModel: AdminReadModel) {
  const capabilities = createCapabilityStore(input.db);

  // GET /admin/roles
  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/roles',
    handler: async () => jsonResponse(await readModel.listRoles()),
  });

  // POST /admin/role/create
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createRoleSchema);
      return jsonResponse(await capabilities.createRole(body), 201);
    },
  });

  // POST /admin/role/update
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateRoleSchema);
      const result = await capabilities.updateRole(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  // POST /admin/role/delete
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteRoleSchema);
      return jsonResponse(await capabilities.deleteRole(body.roleId));
    },
  });
}
