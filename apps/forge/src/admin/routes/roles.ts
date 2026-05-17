/**
 * Role Management Routes — extracted from admin/routes.ts (#4303)
 *
 * Handles:
 *   POST /admin/role/create
 *   POST /admin/role/update
 *   POST /admin/role/delete
 *   POST /admin/role-capability/add
 *   POST /admin/role-capability/remove
 *   POST /admin/role-tool-permission/add
 *   POST /admin/role-tool-permission/remove
 *   POST /admin/role-workflow-permission/add
 *   POST /admin/role-workflow-permission/remove
 */

import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../../database/client';
import type { AgentLoaderConfig } from '../../agents/agent-loader';
import { createCapabilityStore } from '../../capabilities/store';
import { reloadAgentsForRole } from '../../capabilities/runtime';
import type { ForgeHttpServerAdapter } from '../../http/server';
import { jsonResponse, parseJsonBody } from './helpers';
import { createRoleSchema, roleToolPermissionSchema, roleWorkflowPermissionSchema } from './schemas/roles';
import { updateRoleSchema, deleteRoleSchema, roleCapabilitySchema } from './schemas/roles';

export interface RoleRoutesDeps {
  httpServer: ForgeHttpServerAdapter;
  db: Database;
  loaderConfig: AgentLoaderConfig;
}

export function registerRoleRoutes({ httpServer, db, loaderConfig }: RoleRoutesDeps) {
  const capabilities = createCapabilityStore(db);

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/create',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, createRoleSchema);
        return jsonResponse(await capabilities.createRole(body), 201);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to create role', context: { err: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/update',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateRoleSchema);
        const result = await capabilities.updateRole(body);
        void reloadAgentsForRole(db, loaderConfig, body.roleId).catch((error) => {
          forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to reload agents for role', context: { roleId: body.roleId, error: error instanceof Error ? error.message : String(error) } });
        });
        return jsonResponse(result);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to update role', context: { err: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteRoleSchema);
        return jsonResponse(await capabilities.deleteRole(body.roleId));
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to delete role', context: { err: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-capability/add',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleCapabilitySchema);
        const result = await capabilities.manageRoleCapability({ action: 'add', roleId: body.roleId, capabilityId: body.capabilityId });
        await reloadAgentsForRole(db, loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to add role capability', context: { err: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-capability/remove',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleCapabilitySchema);
        const result = await capabilities.manageRoleCapability({ action: 'remove', roleId: body.roleId, capabilityId: body.capabilityId });
        await reloadAgentsForRole(db, loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to remove role capability', context: { err: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-tool-permission/add',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
        const result = await capabilities.addRoleToolPermission(body);
        await reloadAgentsForRole(db, loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to add role tool permission', context: { err: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-workflow-permission/add',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
        const result = await capabilities.addRoleWorkflowPermission(body);
        await reloadAgentsForRole(db, loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to add role workflow permission', context: { err: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-workflow-permission/remove',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
        const result = await capabilities.removeRoleWorkflowPermission(body);
        await reloadAgentsForRole(db, loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to remove role workflow permission', context: { err: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-tool-permission/remove',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
        const result = await capabilities.removeRoleToolPermission({ roleId: (body as any).roleId, toolId: (body as any).toolId });
        await reloadAgentsForRole(db, loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to remove role tool permission', context: { err: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });
}