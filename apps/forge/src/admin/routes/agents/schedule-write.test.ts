import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAgentSchedulesWriteRoutes } from './schedule-write';

// schedule-write.ts imports { forgeDebug, jsonResponse, parseJsonBody } from '../index'
// The real ../index does NOT export forgeDebug (it's only in @forge-runtime/core).
// This mock makes ../index provide a dummy forgeDebug so the handler's catch block
// calls don't throw.
vi.mock('../index', () => ({
  forgeDebug: vi.fn(),
  jsonResponse: (body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  }),
  parseJsonBody: (bodyText: string, schema: any) => {
    if (!bodyText || bodyText.trim() === '{}' || bodyText.trim() === '') return {};
    return schema.parse(JSON.parse(bodyText));
  },
}));

// Also stub the schemas module so parseJsonBody doesn't fail on schema.parse()
vi.mock('../schemas/schedules', () => ({
  createScheduleSchema: {
    parse: vi.fn((data) => data),
  },
  updateScheduleSchema: {
    parse: vi.fn((data) => data),
  },
  deleteScheduleSchema: {
    parse: vi.fn((data) => data),
  },
}));

function parseBody(response: { status: number; body: string }) {
  return JSON.parse(response.body);
}

function createMockSchedules() {
  return {
    createSchedule: vi.fn(),
    updateOwnedSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
  };
}

function createMockHttpServer() {
  const routes: any[] = [];
  return {
    registerRoute: vi.fn((route: any) => routes.push(route)),
    _routes: routes,
  };
}

function makeRequest(body: unknown): { bodyText: string } {
  return { bodyText: JSON.stringify(body) };
}

function getHandler(httpServer: ReturnType<typeof createMockHttpServer>, method: string, path: string) {
  const match = httpServer._routes.find((r: any) => r.method === method && r.path === path);
  if (!match) throw new Error(`Route ${method} ${path} not found`);
  return match.handler;
}

describe('registerAgentSchedulesWriteRoutes', () => {
  let httpServer: ReturnType<typeof createMockHttpServer>;
  let schedules: ReturnType<typeof createMockSchedules>;

  beforeEach(() => {
    httpServer = createMockHttpServer();
    schedules = createMockSchedules();
    vi.clearAllMocks();
  });

  describe('route registration', () => {
    it('registers POST /admin/agent-schedule/create', () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const route = httpServer._routes.find((r: any) => r.path === '/admin/agent-schedule/create');
      expect(route).toBeDefined();
      expect(route.method).toBe('POST');
    });

    it('registers POST /admin/agent-schedule/update', () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const route = httpServer._routes.find((r: any) => r.path === '/admin/agent-schedule/update');
      expect(route).toBeDefined();
      expect(route.method).toBe('POST');
    });

    it('registers POST /admin/agent-schedule/delete', () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const route = httpServer._routes.find((r: any) => r.path === '/admin/agent-schedule/delete');
      expect(route).toBeDefined();
      expect(route.method).toBe('POST');
    });
  });

  describe('POST /admin/agent-schedule/create', () => {
    it('creates a cron schedule and returns 201', async () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const handler = getHandler(httpServer, 'POST', '/admin/agent-schedule/create');

      schedules.createSchedule.mockResolvedValueOnce({
        id: 'sched-1',
        agentId: 'agent-1',
        name: 'Morning Check',
        scheduleType: 'cron',
        cronExpression: '0 9 * * *',
      });

      const response = await handler(makeRequest({
        agentId: 'agent-1',
        name: 'Morning Check',
        description: 'Daily morning check',
        scheduleType: 'cron',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        content: 'Run morning check',
        wakeWhenRunning: true,
      }));

      expect(response.status).toBe(201);
      expect(parseBody(response)).toMatchObject({
        id: 'sched-1',
        scheduleType: 'cron',
        cronExpression: '0 9 * * *',
      });
      expect(schedules.createSchedule).toHaveBeenCalledWith('agent-1', expect.objectContaining({
        name: 'Morning Check',
        scheduleType: 'cron',
        cronExpression: '0 9 * * *',
        wakeWhenRunning: true,
      }));
    });

    it('creates a date schedule with scheduledDate', async () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const handler = getHandler(httpServer, 'POST', '/admin/agent-schedule/create');

      schedules.createSchedule.mockResolvedValueOnce({
        id: 'sched-2',
        agentId: 'agent-1',
        name: 'One-time Task',
        scheduleType: 'date',
        scheduledDate: 1735689600000,
      });

      const response = await handler(makeRequest({
        agentId: 'agent-1',
        name: 'One-time Task',
        description: 'A single run',
        scheduleType: 'date',
        scheduledDate: '2025-01-01T00:00:00.000Z',
        timezone: 'America/Sao_Paulo',
        content: 'Run the thing',
        wakeWhenRunning: true,
      }));

      expect(response.status).toBe(201);
      expect(parseBody(response).scheduleType).toBe('date');
      expect(schedules.createSchedule).toHaveBeenCalledWith('agent-1', expect.not.objectContaining({
        cronExpression: expect.anything(),
      }));
    });

    it('returns 500 on createSchedule error', async () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const handler = getHandler(httpServer, 'POST', '/admin/agent-schedule/create');

      schedules.createSchedule.mockRejectedValueOnce(new Error('Database error'));

      const response = await handler(makeRequest({
        agentId: 'agent-1',
        name: 'Bad Schedule',
        scheduleType: 'cron',
        cronExpression: '0 9 * * *',
      }));

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('Database error');
    });
  });

  describe('POST /admin/agent-schedule/update', () => {
    it('updates a schedule with all fields', async () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const handler = getHandler(httpServer, 'POST', '/admin/agent-schedule/update');

      schedules.updateOwnedSchedule.mockResolvedValueOnce({
        id: 'sched-1',
        agentId: 'agent-1',
        name: 'Updated Name',
        isActive: false,
      });

      const response = await handler(makeRequest({
        agentId: 'agent-1',
        scheduleId: 'sched-1',
        name: 'Updated Name',
        description: 'Updated description',
        scheduleType: 'cron',
        cronExpression: '0 10 * * *',
        timezone: 'Europe/Lisbon',
        content: 'Updated content',
        wakeWhenRunning: false,
        isActive: false,
      }));

      expect(response.status).toBe(200);
      expect(schedules.updateOwnedSchedule).toHaveBeenCalledWith('agent-1', 'sched-1', expect.objectContaining({
        name: 'Updated Name',
        cronExpression: '0 10 * * *',
        isActive: false,
      }));
    });

    it('updates schedule to date type', async () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const handler = getHandler(httpServer, 'POST', '/admin/agent-schedule/update');

      schedules.updateOwnedSchedule.mockResolvedValueOnce({
        id: 'sched-1',
        scheduleType: 'date',
        scheduledDate: 1735689600000,
      });

      const response = await handler(makeRequest({
        agentId: 'agent-1',
        scheduleId: 'sched-1',
        scheduleType: 'date',
        scheduledDate: '2025-01-01T00:00:00.000Z',
        isActive: true,
      }));

      expect(response.status).toBe(200);
      expect(schedules.updateOwnedSchedule).toHaveBeenCalledWith('agent-1', 'sched-1', expect.objectContaining({
        scheduleType: 'date',
        scheduledDate: '2025-01-01T00:00:00.000Z',
        isActive: true,
      }));
    });

    it('returns 500 on updateOwnedSchedule error', async () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const handler = getHandler(httpServer, 'POST', '/admin/agent-schedule/update');

      schedules.updateOwnedSchedule.mockRejectedValueOnce(new Error('Not authorized'));

      const response = await handler(makeRequest({
        agentId: 'agent-1',
        scheduleId: 'sched-999',
        name: 'Hack',
      }));

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('Not authorized');
    });
  });

  describe('POST /admin/agent-schedule/delete', () => {
    it('deletes a schedule', async () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const handler = getHandler(httpServer, 'POST', '/admin/agent-schedule/delete');

      schedules.deleteSchedule.mockResolvedValueOnce({ deleted: true });

      const response = await handler(makeRequest({
        agentId: 'agent-1',
        scheduleId: 'sched-1',
      }));

      expect(response.status).toBe(200);
      expect(schedules.deleteSchedule).toHaveBeenCalledWith('agent-1', 'sched-1');
    });

    it('returns 500 on deleteSchedule error', async () => {
      registerAgentSchedulesWriteRoutes(httpServer, { schedules });
      const handler = getHandler(httpServer, 'POST', '/admin/agent-schedule/delete');

      schedules.deleteSchedule.mockRejectedValueOnce(new Error('Schedule not found'));

      const response = await handler(makeRequest({
        agentId: 'agent-1',
        scheduleId: 'sched-999',
      }));

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('Schedule not found');
    });
  });
});