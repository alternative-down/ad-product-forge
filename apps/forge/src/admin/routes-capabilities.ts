import { z } from 'zod';
import type { Database } from '~/lib/db';
import type { AgentLoaderConfig } from '~/lib/loader';
import type { HttpServer } from '~/lib/http-server';
import { parseJsonBody, jsonResponse } from '~/lib/http';
import { reloadAgentsForFunction, reloadAgentsForRole } from '~/capabilities/runtime';

const functionRoleSchema = z.object({
  functionId: z.string().min(1),
  roleId: z.string().min(1),
});

const roleToolPermissionSchema = z.object({
  roleId: z.string().min(1),
  toolId: z.string().min(1),
});

const roleWorkflowPermissionSchema = z.object({
  roleId: z.string().min(1),
  workflowId: z.string().min(1),
});

export function registerCapabilityRoutes(input: {
  db: Database;
  httpServer: HttpServer;
  loaderConfig: AgentLoaderConfig;
  capabilities: {
    addRoleToFunction: (data: { functionId: string; roleId: string }) => Promise<unknown>;
    removeRoleFromFunction: (data: { functionId: string; roleId: string }) => Promise<unknown>;
    addRoleToolPermission: (data: { roleId: string; toolId: string }) => Promise<unknown>;
    removeRoleToolPermission: (data: { roleId: string; toolId: string }) => Promise<unknown>;
    addRoleWorkflowPermission: (data: { roleId: string; workflowId: string }) => Promise<unknown>;
    removeRoleWorkflowPermission: (data: { roleId: string; workflowId: string }) => Promise<unknown>;
  };
}) {
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/function-role/add',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, functionRoleSchema);
      const result = await input.capabilities.addRoleToFunction(body);

      void reloadAgentsForFunction(input.db, input.loaderConfig, body.functionId).catch((error) => {
        console.error(`[Admin] Failed to reload agents for function ${body.functionId}:`, error);
      });
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/function-role/remove',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, functionRoleSchema);
      const result = await input.capabilities.removeRoleFromFunction(body);

      void reloadAgentsForFunction(input.db, input.loaderConfig, body.functionId).catch((error) => {
        console.error(`[Admin] Failed to reload agents for function ${body.functionId}:`, error);
      });
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-tool-permission/add',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
      const result = await input.capabilities.addRoleToolPermission(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-tool-permission/remove',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
      const result = await input.capabilities.removeRoleToolPermission(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-workflow-permission/add',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
      const result = await input.capabilities.addRoleWorkflowPermission(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-workflow-permission/remove',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
      const result = await input.capabilities.removeRoleWorkflowPermission(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });
}
