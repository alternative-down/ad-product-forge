/**
 * Unit tests for agent-runner-feedback.ts — buildIterationFeedback.
 *
 * Groups:
 *   stuck loop detection — notification + stop
 *   stop directive — setNextStepAt(null) + stop
 *   no-tool-call reminder — nudge when LLM produces visible text without tools
 *   flush pending run messages — inject pending user messages as feedback
 *   LTM recall — inject recall feedback as assistant message
 *   control directive: ignore — suppresses no-tool-call reminder
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildIterationFeedback } from './agent-runner-feedback';
import type { BuildIterationFeedbackDeps } from './agent-runner-feedback';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLoopDetector(stuck = false, signatureCount = 0) {
  return {
    recordIteration: vi.fn<() => boolean>().mockReturnValue(false),
    reset: vi.fn<() => void>(),
    isStuck: vi.fn<() => boolean>().mockReturnValue(stuck),
    getSignatureCount: vi.fn<() => number>().mockReturnValue(signatureCount),
  };
}

// Build the full argument to buildIterationFeedback
// Top-level fields: iteration (inner), finishReason, text, toolCalls, toolResults, messages (optional)
function makeArg(overrides?: {
  innerIteration?: number;
  innerFinishReason?: string;
  text?: string;
  toolCalls?: unknown[];
  toolResults?: unknown[];
  messages?: unknown[];
}) {
  return {
    iteration: {
      iteration: overrides?.innerIteration ?? 0,
      finishReason: overrides?.innerFinishReason ?? 'stop',
    },
    finishReason: 'stop',
    text: '',
    toolCalls: [],
    toolResults: [],
    messages: [],
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<BuildIterationFeedbackDeps>): BuildIterationFeedbackDeps {
  return {
    suppressNoToolCallReminderForRun: false,
    setSuppressNoToolCallReminder: vi.fn(),
    setNextStepAt: vi.fn(),
    loopDetector: makeLoopDetector(),
    loopSignature: 'sig-abc',
    runtime: { id: 'agent-1' },
    notifications: { createNotification: vi.fn<() => Promise<unknown>>() },
    currentRuntime: {
      mastraId: 'thread-1',
      longTermMemoryRecall: undefined,
    },
    flushPendingRunMessages: vi.fn<() => string | null>().mockReturnValue(null),
    markGenerateProgress: vi.fn(),
    controller: new AbortController(),
    isStopped: vi.fn<() => boolean>().mockReturnValue(false),
    ...overrides,
  } as unknown as BuildIterationFeedbackDeps;
}

// ─── Stuck loop detection ────────────────────────────────────────────────────

describe('stuck loop detection', () => {
  let createNotification: ReturnType<typeof vi.fn>;
  let setNextStepAt: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createNotification = vi.fn<() => Promise<unknown>>();
    setNextStepAt = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns continue:false when loop is stuck', async () => {
    const loopDetector = makeLoopDetector(true, 5);
    const deps = makeDeps();

    const result = await buildIterationFeedback(makeArg({ innerIteration: 0 }) as any, deps);

    expect(result).toEqual({ continue: false, feedbackMessages: [] });
  });

  it('creates notification with stuck loop details', async () => {
    const loopDetector = makeLoopDetector(true, 7);
    const deps = makeDeps({
      loopDetector: loopDetector as any,
      notifications: { createNotification } as any,
      setNextStepAt: setNextStepAt as any,
    });

    await buildIterationFeedback(makeArg({ innerIteration: 0 }) as any, deps);

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        content: expect.stringContaining('Stuck loop detected.'),
      }),
    );
  });

  it('sets next step to null', async () => {
    const deps = makeDeps({
      loopDetector: makeLoopDetector(true),
    });

    await buildIterationFeedback(makeArg({ innerIteration: 0 }) as any, deps);

    expect(setNextStepAt).toHaveBeenCalledWith(null);
  });
});

// ─── Stop directive ───────────────────────────────────────────────────────────

describe('stop directive', () => {
  it('returns continue:false when STOP_AND_IDLE text', async () => {
    const setNextStepAt = vi.fn();
    const deps = makeDeps({ setNextStepAt });

    const result = await buildIterationFeedback(makeArg({ text: 'STOP_AND_IDLE' }) as any, deps);

    expect(result).toEqual({ continue: false, feedbackMessages: [] });
    expect(setNextStepAt).toHaveBeenCalledWith(null);
  });

  it('does not call setNextStepAt for other control directives', async () => {
    const setNextStepAt = vi.fn();
    const deps = makeDeps({ setNextStepAt });

    const result = await buildIterationFeedback(makeArg({ text: 'NO_ACTION_NEEDED' }) as any, deps);

    expect(setNextStepAt).not.toHaveBeenCalled();
    // With ignore directive + visible text 'NO_ACTION_NEEDED' + no tool calls
    // → producedVisibleAssistantText = true → reminder fires
    expect(result).toMatchObject({ continue: true });
  });
});

// ─── No-tool-call reminder ────────────────────────────────────────────────────

describe('no-tool-call reminder', () => {
  let setSuppressNoToolCallReminder: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setSuppressNoToolCallReminder = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds RUN_STOP_REMINDER when no tools and has text', async () => {
    const deps = makeDeps({
      suppressNoToolCallReminderForRun: false,
      setSuppressNoToolCallReminder: setSuppressNoToolCallReminder as any,
    });

    const result = await buildIterationFeedback(
      makeArg({ text: 'Here is my response.', toolCalls: [] }) as any,
      deps,
    );

    expect(result).toMatchObject({
      continue: true,
      feedbackMessages: [
        { role: 'user', content: expect.stringContaining('A response without tool calls') },
      ],
    });
  });

  it('does not add reminder when tools are present', async () => {
    const deps = makeDeps({
      suppressNoToolCallReminderForRun: false,
      setSuppressNoToolCallReminder: setSuppressNoToolCallReminder as any,
    });

    const result = await buildIterationFeedback(
      makeArg({ text: 'Using a tool', toolCalls: [{ name: 'test_tool', args: {} }] }) as any,
      deps,
    );

    expect(result).toBeUndefined();
  });

  it('does not add reminder when suppressed', async () => {
    const deps = makeDeps({
      suppressNoToolCallReminderForRun: true,
      setSuppressNoToolCallReminder: setSuppressNoToolCallReminder as any,
    });

    const result = await buildIterationFeedback(
      makeArg({ text: 'Plain text', toolCalls: [] }) as any,
      deps,
    );

    expect(result).toBeUndefined();
  });

  it('suppresses reminder when ignore directive and no tool calls', async () => {
    const deps = makeDeps({
      suppressNoToolCallReminderForRun: false,
      setSuppressNoToolCallReminder: setSuppressNoToolCallReminder as any,
    });

    await buildIterationFeedback(
      makeArg({ text: 'NO_ACTION_NEEDED some text', toolCalls: [] }) as any,
      deps,
    );

    expect(setSuppressNoToolCallReminder).toHaveBeenCalledWith(true);
  });
});

// ─── Flush pending run messages ──────────────────────────────────────────────

describe('flush pending run messages', () => {
  it('adds flushed prompt as user feedback', async () => {
    const flushMock = vi.fn<() => string | null>().mockReturnValue('Pending message');
    const deps = makeDeps({
      suppressNoToolCallReminderForRun: true,
      flushPendingRunMessages: flushMock,
    });

    const result = await buildIterationFeedback(makeArg({ toolCalls: [] }) as any, deps);

    expect(result).toEqual({
      continue: true,
      feedbackMessages: [{ role: 'user', content: 'Pending message' }],
    });
  });

  it('no feedback when suppressed and no flush', async () => {
    const deps = makeDeps({
      suppressNoToolCallReminderForRun: true,
      flushPendingRunMessages: vi.fn<() => string | null>().mockReturnValue(null),
    });

    const result = await buildIterationFeedback(makeArg({ toolCalls: [] }) as any, deps);

    expect(result).toBeUndefined();
  });

  it('reminder fires when not suppressed and no flush', async () => {
    const deps = makeDeps({
      suppressNoToolCallReminderForRun: false,
      flushPendingRunMessages: vi.fn<() => string | null>().mockReturnValue(null),
    });

    const result = await buildIterationFeedback(
      makeArg({ text: 'Hello', toolCalls: [] }) as any,
      deps,
    );

    expect(result).toMatchObject({
      continue: true,
      feedbackMessages: [
        { role: 'user', content: expect.stringContaining('A response without tool calls') },
      ],
    });
  });
});

// ─── LTM recall ───────────────────────────────────────────────────────────────

describe('LTM recall', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined when no recall', async () => {
    const deps = makeDeps({
      suppressNoToolCallReminderForRun: true,
      currentRuntime: {
        mastraId: 'thread-1',
        longTermMemoryRecall: {
          recallFromStep: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const result = await buildIterationFeedback(makeArg({ toolCalls: [] }) as any, deps);

    expect(result).toBeUndefined();
  });

  it('returns undefined when longTermMemoryRecall is undefined', async () => {
    const deps = makeDeps({
      suppressNoToolCallReminderForRun: true,
      currentRuntime: {
        mastraId: 'thread-1',
        longTermMemoryRecall: undefined,
      },
    });

    const result = await buildIterationFeedback(makeArg({ toolCalls: [] }) as any, deps);

    expect(result).toBeUndefined();
  });
});

// ─── Combined feedback ────────────────────────────────────────────────────────

describe('combined feedback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('combines flush + LTM recall into multiple messages', async () => {
    const deps = makeDeps({
      suppressNoToolCallReminderForRun: true,
      flushPendingRunMessages: vi.fn<() => string | null>().mockReturnValue('Pending message'),
      currentRuntime: {
        mastraId: 'thread-1',
        longTermMemoryRecall: {
          recallFromStep: vi.fn().mockResolvedValue('Recalled memory content'),
        },
      },
    });

    const result = await buildIterationFeedback(makeArg({ toolCalls: [] }) as any, deps);

    expect(result).toMatchObject({
      continue: true,
      feedbackMessages: expect.arrayContaining([
        { role: 'user', content: 'Pending message' },
        { role: 'assistant', content: 'Recalled memory content' },
      ]),
    });
  });
});
