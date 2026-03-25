import { z } from 'zod';

import type { Database } from '../database/index';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import type { AdminReadModel } from './read-model';
import type { createForgeHttpServer } from '../http/server';
import { createCapabilityStore } from '../capabilities/store';
import { reloadAgentsForFunction } from '../capabilities/runtime';

type HttpServer = ReturnType<typeof createForgeHttpServer>;

type AdminRoutesInput = {
  db: Database;
  httpServer: HttpServer;
  loaderConfig: AgentLoaderConfig;
  workspaceBasePath: string;
  schedules: object;
  integrations: object;
  emailMailboxes: object | null;
  coolify: object | null;
  githubApps: object;
};

// Schemas
const createFunctionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateFunctionSchema = z.object({
  functionId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

const deleteFunctionSchema = z.object({
  functionId: z.string().min(1),
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

export function registerFunctionRoutes(input: AdminRoutesInput, readModel: AdminReadModel) {
  const capabilities = createCapabilityStore(input.db);

  // GET /admin/functions
  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/functions',
    handler: async () => jsonResponse(await readModel.listFunctions()),
  });

  // POST /admin/function/create
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/function/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createFunctionSchema);
      return jsonResponse(await capabilities.createFunction(body), 201);
    },
  });

  // POST /admin/function/update
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/function/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateFunctionSchema);
      const result = await capabilities.updateFunction(body);
      await reloadAgentsForFunction(input.db, input.loaderConfig, body.functionId);
      return jsonResponse(result);
    },
  });

  // POST /admin/function/delete
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/function/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteFunctionSchema);
      return jsonResponse(await capabilities.deleteFunction(body.functionId));
    },
  });
}
