/**
 * Role Admin Operations — extracted from write-ops.ts
 */

import { z } from 'zod';


import { jsonResponse, parseJsonBody } from '../../index';
import { createCapabilityStore } from '../../../../capabilities/store';
import type { HttpHandler } from '../../../../http/server';
import { forgeDebug } from '../../debug';

const createRoleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
}).strict();

const updateRoleSchema = z.object({
  roleId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
}).strict();

const deleteRoleSchema = z.object({
  roleId: z.string(),
}).strict();

const _roleCapabilitySchema = z.object({
  roleId: z.string(),
  capabilityName: z.string(),
  capabilityValue: z.boolean(),
}).strict();

const roleToolPermissionSchema = z.object({
  roleId: z.string(),
  toolName: z.string(),
  allowed: z.boolean(),
}).strict();

const _roleWorkflowPermissionSchema = z.object({
  roleId: z.string(),
  workflowName: z.string(),
  allowed: z.boolean(),
}).strict();

export function registerRoleOps(
  httpServer: { registerRoute: (route: { method: "POST"; path: string; handler: HttpHandler }) => void },
  db: Parameters<typeof createCapabilityStore>[0],
) {
  const capabilities = createCapabilityStore(db);
  const resolvePermissionId = (name: string) => name;

  // POST /admin/roles/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/create',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, createRoleSchema);
        const result = await capabilities.createRole({ name: body.name, description: body.description });
        return jsonResponse({ success: true, roleId: result.roleId, name: result.name });
      } catch (err) {
        forgeDebug({ scope: "admin", level: "error", message: "/admin/roles/create", context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });

  // POST /admin/roles/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/update',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateRoleSchema);
        const result = await capabilities.updateRole({ roleId: body.roleId, name: body.name, description: body.description });
        return jsonResponse({ success: true, roleId: result.roleId, name: result.name });
      } catch (err) {
        forgeDebug({ scope: "admin", level: "error", message: "/admin/roles/update", context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });

  // POST /admin/roles/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteRoleSchema);
        await capabilities.deleteRole(body.roleId);
        return jsonResponse({ success: true, roleId: body.roleId });
      } catch (err) {
        const msg = String(serializeError(err));
        forgeDebug({ scope: 'admin:roles', level: 'error', message: `deleteRole failed: ${err}` });
        if (msg.startsWith('Cannot delete role')) return jsonResponse({ error: msg }, 409);
        throw err;
      }
    },
  });

  // POST /admin/roles/tool-permissions
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/roles/tool-permissions',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
        const toolId = resolvePermissionId(body.toolName);
        if (body.allowed === true) {
          await capabilities.addRoleToolPermission({ roleId: body.roleId, toolId });
        } else {
          await capabilities.removeRoleToolPermission({ roleId: body.roleId, toolId });
        }
        return jsonResponse({ success: true, roleId: body.roleId, toolId, allowed: body.allowed });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/roles/tool-permissions', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });
}
import { serializeError } from '../../../../agents/agent-runner-error-formatting';