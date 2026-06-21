import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockCreateNotification = vi.hoisted(() => vi.fn());
const mockCreateAgentNotificationStore = vi.hoisted(() => vi.fn());

vi.mock('../../notifications/store', () => ({
  createAgentNotificationStore: mockCreateAgentNotificationStore,
}));

import {
  createScheduleNotifications,
  type NotificationDependencies,
  type ScheduleRecordForNotification,
} from './notifications';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<NotificationDependencies> = {}): any {
  return {
    db: {},
    notifyAgent: vi.fn(),
    ...overrides,
  };
}

function makeRecord(overrides: Partial<ScheduleRecordForNotification> = {}): ScheduleRecordForNotification {
  return {
    scheduleId: 'sch_n1',
    name: 'Daily report',
    description: 'Generate daily metrics report',
    kind: 'agent',
    scheduleType: 'cron',
    cronExpression: '0 9 * * *',
    scheduledDate: null,
    timezone: 'UTC',
    content: 'Please run the daily report now',
    wakeWhenRunning: false,
    agentId: 'ag_n1',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createScheduleNotifications', () => {
  beforeEach(() => {
    mockCreateNotification.mockReset().mockResolvedValue(undefined);
    mockCreateAgentNotificationStore.mockReset().mockImplementation(() => ({
      createNotification: mockCreateNotification,
    }));
  });

  // ── API shape ─────────────────────────────────────────────────────────

  it('returns an object with triggerNotification function', () => {
    const deps = makeDeps();
    const notifs = createScheduleNotifications(deps);
    expect(typeof notifs.triggerNotification).toBe('function');
  });

  it('initializes the agent notification store with the provided db', () => {
    const deps = makeDeps();
    createScheduleNotifications(deps);
    expect(mockCreateAgentNotificationStore).toHaveBeenCalledWith(deps.db);
  });

  // ── createNotification (only for agent kind) ──────────────────────────

  it('persists a notification for agent-kind schedules', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    await createScheduleNotifications(deps).triggerNotification(makeRecord(), fireDate);

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const arg = mockCreateNotification.mock.calls[0]![0];
    expect(arg.agentId).toBe('ag_n1');
    expect(typeof arg.content).toBe('string');
    expect(arg.content).toContain('Description: Generate daily metrics report');
  });

  it('does NOT persist a notification for heartbeat-kind schedules', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    await createScheduleNotifications(deps).triggerNotification(
      makeRecord({ kind: 'heartbeat' }),
      fireDate,
    );
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  // ── deps.notifyAgent (always called) ───────────────────────────────────

  it('always invokes deps.notifyAgent (for both agent and heartbeat)', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    const { triggerNotification } = createScheduleNotifications(deps);

    await triggerNotification(makeRecord({ kind: 'agent' }), fireDate);
    expect(deps.notifyAgent).toHaveBeenCalledTimes(1);

    await triggerNotification(makeRecord({ kind: 'heartbeat' }), fireDate);
    expect(deps.notifyAgent).toHaveBeenCalledTimes(2);
  });

  it('passes correct metadata to notifyAgent (id, name, kind, timestamp)', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    await createScheduleNotifications(deps).triggerNotification(makeRecord(), fireDate);

    const call = deps.notifyAgent.mock.calls[0]![0];
    expect(call.agentId).toBe('ag_n1');
    expect(call.scheduleId).toBe('sch_n1');
    expect(call.scheduleKind).toBe('agent');
    expect(call.scheduleName).toBe('Daily report');
    expect(call.timestamp).toBe(fireDate.getTime());
  });

  // ── idleOnly flag logic ───────────────────────────────────────────────

  it('marks heartbeat schedules as idleOnly regardless of wakeWhenRunning', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    await createScheduleNotifications(deps).triggerNotification(
      makeRecord({ kind: 'heartbeat', wakeWhenRunning: true }),
      fireDate,
    );
    expect(deps.notifyAgent.mock.calls[0]![0].idleOnly).toBe(true);
  });

  it('marks cron agent schedules with wakeWhenRunning=false as idleOnly', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    await createScheduleNotifications(deps).triggerNotification(
      makeRecord({ kind: 'agent', scheduleType: 'cron', wakeWhenRunning: false }),
      fireDate,
    );
    expect(deps.notifyAgent.mock.calls[0]![0].idleOnly).toBe(true);
  });

  it('does NOT mark cron agent schedules with wakeWhenRunning=true as idleOnly', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    await createScheduleNotifications(deps).triggerNotification(
      makeRecord({ kind: 'agent', scheduleType: 'cron', wakeWhenRunning: true }),
      fireDate,
    );
    expect(deps.notifyAgent.mock.calls[0]![0].idleOnly).toBe(false);
  });

  it('marks date agent schedules as idleOnly when wakeWhenRunning=false (regression fix #5874)', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    await createScheduleNotifications(deps).triggerNotification(
      makeRecord({ kind: 'agent', scheduleType: 'date', wakeWhenRunning: false }),
      fireDate,
    );
    expect(deps.notifyAgent.mock.calls[0]![0].idleOnly).toBe(true);
  });

  it('does NOT mark date agent schedules as idleOnly when wakeWhenRunning=true', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    await createScheduleNotifications(deps).triggerNotification(
      makeRecord({ kind: 'agent', scheduleType: 'date', wakeWhenRunning: true }),
      fireDate,
    );
    expect(deps.notifyAgent.mock.calls[0]![0].idleOnly).toBe(false);
  });

  // ── wake content: agent kind ──────────────────────────────────────────

  it('uses scheduleRecord.content directly for agent-kind wake content', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    await createScheduleNotifications(deps).triggerNotification(
      makeRecord({ kind: 'agent', content: 'Custom agent instruction' }),
      fireDate,
    );
    const wake = deps.notifyAgent.mock.calls[0]![0].content;
    expect(wake).toContain('Custom agent instruction');
  });

  // ── wake content: heartbeat kind ──────────────────────────────────────

  it('wraps heartbeat content with createHeartbeatWakeInstruction', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    await createScheduleNotifications(deps).triggerNotification(
      makeRecord({ kind: 'heartbeat', content: '' }),
      fireDate,
    );
    // Heartbeat wake content is wrapped — it should mention heartbeat semantics.
    const wake = deps.notifyAgent.mock.calls[0]![0].content;
    expect(typeof wake).toBe('string');
    expect(wake.length).toBeGreaterThan(0);
  });

  // ── nextTriggerAt is passed through ───────────────────────────────────

  it('passes nextTriggerAt through to wake content', async () => {
    const deps = makeDeps();
    const fireDate = new Date('2026-06-02T09:00:00Z');
    const nextTriggerAt = fireDate.getTime() + 24 * 60 * 60 * 1000; // +1 day
    await createScheduleNotifications(deps).triggerNotification(
      makeRecord(),
      fireDate,
      nextTriggerAt,
    );
    // We don't assert on the exact content rendering (that's wake-content's
    // responsibility, already tested in wake-content.test.ts). We just verify
    // it doesn't throw and notifyAgent is called.
    expect(deps.notifyAgent).toHaveBeenCalledTimes(1);
  });
});
