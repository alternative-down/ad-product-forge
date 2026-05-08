import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => ({
  parseJsonBody: vi.fn().mockImplementation((bodyText, _schema) => JSON.parse(bodyText)),
  jsonResponse: vi.fn((body, status = 200) => ({ status, body })),
  forgeDebug: vi.fn(),
}));

import { registerAgentSchedulesWriteRoutes } from './schedule-write';
import type { HttpRequest } from '../../../http/server';

function createMockSchedules() {
  return {
    createSchedule: vi.fn(),
    updateOwnedSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    removeAgent: vi.fn(),
  };
}

function createMockHttpServer() {
  const routes: Array<{ method: string; path: string; handler: Function }> = [];
  return {
    registerRoute: vi.fn((route) => routes.push(route)),
    _routes: routes,
  };
}

function mockRequest(body: object, path = '/admin/agent-schedule/create'): HttpRequest {
  return { method: 'POST', path, bodyText: JSON.stringify(body), query: '', headers: {} } as any;
}

describe('registerAgentSchedulesWriteRoutes', () => {
  let schedules: ReturnType<typeof createMockSchedules>;
  let httpServer: ReturnType<typeof createMockHttpServer>;

  beforeEach(() => {
    schedules = createMockSchedules();
    httpServer = createMockHttpServer();
    vi.clearAllMocks();
  });

  // ── POST /admin/agent-schedule/create ───────────────────────────────────────

  describe('POST /admin/agent-schedule/create', () => {
    it('registers the route', () => {
      registerAgentSchedulesWriteRoutes(httpServer as any, { schedules } as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-schedule/create');
      expect(route).toBeDefined();
      expect(route?.method).toBe('POST');
    });

    it('calls createSchedule with cron input and returns 201', async () => {
      schedules.createSchedule.mockResolvedValueOnce({ scheduleId: 'sched-1', name: 'My Cron' });
      registerAgentSchedulesWriteRoutes(httpServer as any, { schedules } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-schedule/create')!.handler;
      const response = await handler(mockRequest({
        agentId: 'agent-1',
        name: 'My Cron',
        description: 'Run every hour',
        scheduleType: 'cron',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        content: 'echo hi',
        wakeWhenRunning: true,
      }));
      expect(response.status).toBe(201);
      expect(response.body.scheduleId).toBe('sched-1');
      expect(schedules.createSchedule).toHaveBeenCalledWith('agent-1', expect.objectContaining({
        name: 'My Cron',
        scheduleType: 'cron',
        cronExpression: '0 * * * *',
      }));
    });

    it('calls createSchedule with date input for one-time schedule', async () => {
      schedules.createSchedule.mockResolvedValueOnce({ scheduleId: 'sched-2' });
      registerAgentSchedulesWriteRoutes(httpServer as any, { schedules } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-schedule/create')!.handler;
      const response = await handler(mockRequest({
        agentId: 'agent-1',
        name: 'One-time',
        description: null,
        scheduleType: 'date',
        scheduledDate: '2025-12-01T10:00:00Z',
        timezone: 'UTC',
        content: 'send email',
        wakeWhenRunning: false,
      }));
      expect(schedules.createSchedule).toHaveBeenCalledWith('agent-1', expect.objectContaining({
        name: 'One-time',
        scheduleType: 'date',
        scheduledDate: '2025-12-01T10:00:00Z',
      }));
    });

    it('returns 500 on error', async () => {
      schedules.createSchedule.mockRejectedValueOnce(new Error('DB error'));
      registerAgentSchedulesWriteRoutes(httpServer as any, { schedules } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-schedule/create')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', name: 'Test', scheduleType: 'cron', cronExpression: '0 0 * * *', timezone: 'UTC', content: '', wakeWhenRunning: false }));
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('DB error');
    });
  });

  // ── POST /admin/agent-schedule/update ──────────────────────────────────────

  describe('POST /admin/agent-schedule/update', () => {
    it('registers the route', () => {
      registerAgentSchedulesWriteRoutes(httpServer as any, { schedules } as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-schedule/update');
      expect(route).toBeDefined();
    });

    it('calls updateOwnedSchedule with all fields and returns 200', async () => {
      schedules.updateOwnedSchedule.mockResolvedValueOnce({ scheduleId: 'sched-u1', name: 'Updated' });
      registerAgentSchedulesWriteRoutes(httpServer as any, { schedules } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-schedule/update')!.handler;
      const response = await handler(mockRequest({
        agentId: 'agent-1',
        scheduleId: 'sched-u1',
        name: 'Updated',
        description: 'New desc',
        scheduleType: 'cron',
        cronExpression: '*/15 * * * *',
        timezone: 'America/New_York',
        content: 'updated content',
        wakeWhenRunning: true,
        isActive: false,
      }, '/admin/agent-schedule/update'));
      expect(response.status).toBe(200);
      expect(schedules.updateOwnedSchedule).toHaveBeenCalledWith('agent-1', 'sched-u1', expect.objectContaining({
        name: 'Updated',
        isActive: false,
      }));
    });

    it('returns 500 on update error', async () => {
      schedules.updateOwnedSchedule.mockRejectedValueOnce(new Error('Update failed'));
      registerAgentSchedulesWriteRoutes(httpServer as any, { schedules } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-schedule/update')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', scheduleId: 'sched-x', name: 'X', scheduleType: 'cron', cronExpression: '0 0 * * *', timezone: 'UTC', content: '', wakeWhenRunning: false }, '/admin/agent-schedule/update'));
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Update failed');
    });
  });

  // ── POST /admin/agent-schedule/delete ──────────────────────────────────────

  describe('POST /admin/agent-schedule/delete', () => {
    it('registers the route', () => {
      registerAgentSchedulesWriteRoutes(httpServer as any, { schedules } as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-schedule/delete');
      expect(route).toBeDefined();
    });

    it('calls deleteSchedule with agentId and scheduleId', async () => {
      schedules.deleteSchedule.mockResolvedValueOnce({ success: true });
      registerAgentSchedulesWriteRoutes(httpServer as any, { schedules } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-schedule/delete')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', scheduleId: 'sched-del' }, '/admin/agent-schedule/delete'));
      expect(response.status).toBe(200);
      expect(schedules.deleteSchedule).toHaveBeenCalledWith('agent-1', 'sched-del');
    });

    it('returns 500 on delete error', async () => {
      schedules.deleteSchedule.mockRejectedValueOnce(new Error('Delete failed'));
      registerAgentSchedulesWriteRoutes(httpServer as any, { schedules } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-schedule/delete')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', scheduleId: 'sched-x' }, '/admin/agent-schedule/delete'));
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Delete failed');
    });
  });
});