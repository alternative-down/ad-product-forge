/**
 * Agent Schedules Admin Routes - extracted from routes.ts (#1519)
 * POST routes for agent schedule management
 */

import type { ForgeHttpServerAdapter } from '../../../http/server';
import type { AdminRouteContext } from '../../routes';
import { forgeDebug } from '../debug';
import { jsonResponse, parseJsonBody } from '../index';
import { createScheduleSchema, updateScheduleSchema, deleteScheduleSchema } from '../schemas/schedules';

export function registerAgentSchedulesWriteRoutes(
  httpServer: ForgeHttpServerAdapter,
  input: {
    schedules: AdminRouteContext['schedules'];
  },
) {
  // POST /admin/agent-schedule/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/create',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, createScheduleSchema);
        const scheduleInput = body.scheduleType === 'cron'
          ? {
              name: body.name,
              description: body.description,
              scheduleType: body.scheduleType,
              cronExpression: body.cronExpression!,
              timezone: body.timezone,
              content: body.content,
              wakeWhenRunning: body.wakeWhenRunning,
            }
          : {
              name: body.name,
              description: body.description,
              scheduleType: body.scheduleType,
              scheduledDate: body.scheduledDate!,
              timezone: body.timezone,
              content: body.content,
              wakeWhenRunning: body.wakeWhenRunning,
            };
        const schedule = await input.schedules.createSchedule(body.agentId, scheduleInput);
        return jsonResponse(schedule, 201);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/agent-schedule/create', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });

  // POST /admin/agent-schedule/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/update',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateScheduleSchema);
        const schedule = await input.schedules.updateOwnedSchedule(body.agentId, body.scheduleId, {
          name: body.name,
          description: body.description,
          scheduleType: body.scheduleType,
          cronExpression: body.cronExpression,
          scheduledDate: body.scheduledDate,
          timezone: body.timezone,
          content: body.content,
          wakeWhenRunning: body.wakeWhenRunning,
          isActive: body.isActive,
        });
        return jsonResponse(schedule);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/agent-schedule/update', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });

  // POST /admin/agent-schedule/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteScheduleSchema);
        const result = await input.schedules.deleteSchedule(body.agentId, body.scheduleId);
        return jsonResponse(result);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/agent-schedule/delete', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });
}
import { serializeError } from '../../../agents/agent-runner-error-formatting';