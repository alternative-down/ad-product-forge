import { describe, expect, it, expectTypeOf, vi, beforeEach } from 'vitest';
import { createHeartbeatSchedule, type CreateHeartbeatInput } from './heartbeat';
import type { createAgentScheduleStore } from '../manager/store';
import {
  HEARTBEAT_CRON_EXPRESSION,
  HEARTBEAT_NAME,
  HEARTBEAT_TIMEZONE,
} from './cron';

function makeInput(overrides: Partial<CreateHeartbeatInput> = {}): CreateHeartbeatInput {
  return {
    agentId: 'ag_hb1',
    store: {
      createSchedule: vi.fn().mockResolvedValue({ id: 'sch_hb', scheduleId: 'sch_hb' }),
    },
    ...overrides,
  };
}

describe('createHeartbeatSchedule()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls store.createSchedule with required heartbeat params', async () => {
    const input = makeInput();
    await createHeartbeatSchedule(input);
    expect(input.store.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'ag_hb1',
        kind: 'heartbeat',
        name: HEARTBEAT_NAME,
        scheduleType: 'cron',
        cronExpression: HEARTBEAT_CRON_EXPRESSION,
        timezone: HEARTBEAT_TIMEZONE,
        content: '',
      }),
    );
  });

  it('passes the provided agentId through to the store', async () => {
    const input = makeInput({ agentId: 'ag_other' });
    await createHeartbeatSchedule(input);
    expect(input.store.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'ag_other' }),
    );
  });

  it('returns the store result', async () => {
    const input = makeInput();
    const result = await createHeartbeatSchedule(input);
    expect(result).toEqual({ id: 'sch_hb', scheduleId: 'sch_hb' });
  });

  it('uses a fixed cron expression (no per-call override)', async () => {
    const input = makeInput();
    await createHeartbeatSchedule(input);
    const call = (input.store.createSchedule as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(call.cronExpression).toBe('0 * * * *');
  });

  it('does NOT pass redundant defaults (regression for #5574)', async () => {
    // After #5574 refactor: description/scheduledDate/wakeWhenRunning are removed
    // from the call because they are optional in the real type with store defaults.
    const input = makeInput();
    await createHeartbeatSchedule(input);
    const call = (input.store.createSchedule as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    // description/scheduledDate/wakeWhenRunning are optional and use store defaults.
    expect(call.description).toBeUndefined();
    expect(call.scheduledDate).toBeUndefined();
    expect(call.wakeWhenRunning).toBeUndefined();
  });

  it('CreateHeartbeatInput.store.createSchedule input type derives from store (regression for #5574)', () => {
    // Compile-time check: the input parameter shape must be assignable from
    // the real store input. If store.createSchedule changes, this breaks at compile time.
    expectTypeOf<Parameters<CreateHeartbeatInput['store']['createSchedule']>[0]>().toEqualTypeOf<
      Parameters<ReturnType<typeof createAgentScheduleStore>['createSchedule']>[0]
    >();
  });
});

describe('cron constants', () => {
  it('exposes a valid cron expression (5 fields)', () => {
    expect(HEARTBEAT_CRON_EXPRESSION.split(' ').length).toBe(5);
  });

  it('uses UTC timezone', () => {
    expect(HEARTBEAT_TIMEZONE).toBe('UTC');
  });

  it('has a non-empty display name', () => {
    expect(HEARTBEAT_NAME.length).toBeGreaterThan(0);
  });
});
