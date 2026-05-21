/**
 * Unit tests for agents/agent-runner-generate.ts.
 *
 * Tests buildIterationFeedback() — the post-iteration processing function.
 * No prior coverage — new module extracted from agent-runner.ts (#1718).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildIterationFeedback } from './agent-runner-feedback';
import { RUN_STOP_REMINDER } from './agent-runner-wake';

const MOCK_RUNTIME_ID = 'agent-42';

type IterationArg = Parameters<typeof buildIterationFeedback>[0];

// ─── Shared mock factories ───────────────────────────────────────────────────

function makeLoopDetector(stuck = false, signatureCount = 0) {
  return {
    recordIteration: vi.fn<() => boolean>(),
    reset: vi.fn(),
    isStuck: vi.fn<() => boolean>().mockReturnValue(stuck),
    getSignatureCount: vi.fn<() => number>().mockReturnValue(signatureCount),
  };
}

function makeIteration(
  overrides: {
    text?: string;
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    toolResults?: Array<{ name: string; error?: Error }>;
    finishReason?: string;
  } = {},
): IterationArg {
  // buildIterationFeedback param has: iteration, finishReason, text, toolCalls, toolResults
  // didIterationProduceVisibleAssistantText expects: iteration.text + iteration.messages
  return {
    iteration: { iteration: 1, finishReason: overrides.finishReason ?? 'stop' },
    finishReason: overrides.finishReason ?? 'stop',
    text: overrides.text ?? 'Hello world',
    toolCalls: overrides.toolCalls ?? [],
    toolResults: overrides.toolResults ?? [],
    messages: [], // satisfies didIterationProduceVisibleAssistantText(iteration)
  };
}

function makeMinimalDeps(overrides: Partial<Parameters<typeof buildIterationFeedback>[1]> = {}) {
  return {
    suppressNoToolCallReminderForRun: false,
    setSuppressNoToolCallReminder: vi.fn<(val: boolean) => void>(),
    setNextStepAt: vi.fn<(val: number | null) => void>(),
    loopDetector: makeLoopDetector(),
    loopSignature: 'sig-abc',
    runtime: { id: MOCK_RUNTIME_ID },
    notifications: {
      createNotification: vi.fn<() => Promise<unknown>>(),
    },
    currentRuntime: {
      mastraId: 'mastra-1',
      longTermMemoryRecall: undefined,
    },
    flushPendingRunMessages: vi.fn<() => string | null>().mockReturnValue(null),
    markGenerateProgress: vi.fn(),
    controller: { signal: { aborted: false } } as unknown as AbortController,
    isStopped: vi.fn<() => boolean>().mockReturnValue(false),
    ...overrides,
  } as Parameters<typeof buildIterationFeedback>[1];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildIterationFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Loop detection ──────────────────────────────────────────────────────────

  describe('loop detection', () => {
    it('returns continue:false when loop is stuck', async () => {
      const deps = makeMinimalDeps({
        loopDetector: makeLoopDetector(true, 5),
        notifications: {
          createNotification: vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
        },
      });

      const result = await buildIterationFeedback(makeIteration(), deps);

      expect(result).toEqual({ continue: false, feedbackMessages: [] });
    });

    it('calls notifications.createNotification when stuck', async () => {
      const createNotification = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
      const deps = makeMinimalDeps({
        loopDetector: makeLoopDetector(true, 3),
        notifications: { createNotification },
      });

      await buildIterationFeedback(makeIteration(), deps);

      expect(createNotification).toHaveBeenCalledWith({
        agentId: MOCK_RUNTIME_ID,
        content: expect.stringContaining('Stuck loop detected'),
      });
    });

    it('calls setNextStepAt(null) when stuck', async () => {
      const setNextStepAt = vi.fn<(val: number | null) => void>();
      const deps = makeMinimalDeps({
        setNextStepAt,
        loopDetector: makeLoopDetector(true, 1),
        notifications: {
          createNotification: vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
        },
      });

      await buildIterationFeedback(makeIteration(), deps);

      expect(setNextStepAt).toHaveBeenCalledWith(null);
    });

    it('returns undefined when loop is not stuck and no other feedback applies', async () => {
      const deps = makeMinimalDeps();

      const result = await buildIterationFeedback(
        makeIteration({
          text: '',
          toolCalls: [],
        }),
        deps,
      );

      expect(result).toBeUndefined();
    });
  });

  // ── Stop directive ───────────────────────────────────────────────────────────

  describe('stop directive', () => {
    it('returns continue:false when STOP_AND_IDLE is present', async () => {
      const setNextStepAt = vi.fn<(val: number | null) => void>();
      const deps = makeMinimalDeps({
        setNextStepAt,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      const result = await buildIterationFeedback(
        makeIteration({
          text: 'STOP_AND_IDLE',
          toolCalls: [],
        }),
        deps,
      );

      expect(result).toEqual({ continue: false, feedbackMessages: [] });
    });

    it('calls setNextStepAt(null) when stop is requested', async () => {
      const setNextStepAt = vi.fn<(val: number | null) => void>();
      const deps = makeMinimalDeps({
        setNextStepAt,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      await buildIterationFeedback(
        makeIteration({
          text: 'STOP_AND_IDLE',
          toolCalls: [],
        }),
        deps,
      );

      expect(setNextStepAt).toHaveBeenCalledWith(null);
    });
  });

  // ── suppressNoToolCallReminder flag ─────────────────────────────────────────

  describe('suppressNoToolCallReminder', () => {
    it('sets suppress when NO_ACTION_NEEDED text has no tool calls', async () => {
      const setSuppress = vi.fn<(val: boolean) => void>();
      const deps = makeMinimalDeps({
        setSuppressNoToolCallReminder: setSuppress,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      // suppress condition: toolCalls.length === 0 AND controlDirective === 'ignore'
      await buildIterationFeedback(
        makeIteration({
          text: 'NO_ACTION_NEEDED',
          toolCalls: [],
        }),
        deps,
      );

      expect(setSuppress).toHaveBeenCalledWith(true);
    });
  });

  // ── RUN_STOP_REMINDER injection ─────────────────────────────────────────────

  describe('RUN_STOP_REMINDER injection', () => {
    it('injects reminder when no tool calls, visible text, no stop', async () => {
      const deps = makeMinimalDeps({
        suppressNoToolCallReminderForRun: false,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      const result = await buildIterationFeedback(
        makeIteration({
          text: 'Some visible output',
          toolCalls: [],
        }),
        deps,
      );

      expect(result).toEqual({
        continue: true,
        feedbackMessages: [{ role: 'user', content: RUN_STOP_REMINDER }],
      });
    });

    it('does NOT inject reminder when stop is requested', async () => {
      const deps = makeMinimalDeps({
        suppressNoToolCallReminderForRun: false,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      const result = await buildIterationFeedback(
        makeIteration({
          text: 'STOP_AND_IDLE',
          toolCalls: [],
        }),
        deps,
      );

      expect(result).toEqual({ continue: false, feedbackMessages: [] });
    });

    it('does NOT inject reminder when suppress flag is set', async () => {
      const deps = makeMinimalDeps({
        suppressNoToolCallReminderForRun: true,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      const result = await buildIterationFeedback(
        makeIteration({
          text: 'Some visible text',
          toolCalls: [],
        }),
        deps,
      );

      expect(result).toBeUndefined();
    });

    it('does NOT inject reminder when tool calls are present', async () => {
      const deps = makeMinimalDeps({
        suppressNoToolCallReminderForRun: false,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      const result = await buildIterationFeedback(
        makeIteration({
          text: 'Some visible text',
          toolCalls: [{ name: 'someTool', args: {} }],
        }),
        deps,
      );

      expect(result).toBeUndefined();
    });

    it('does NOT inject reminder when no visible text', async () => {
      const deps = makeMinimalDeps({
        suppressNoToolCallReminderForRun: false,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      const result = await buildIterationFeedback(
        makeIteration({
          text: '',
          toolCalls: [],
        }),
        deps,
      );

      expect(result).toBeUndefined();
    });
  });

  // ── Pending message flushing ───────────────────────────────────────────────

  describe('pending message flushing', () => {
    it('includes flushed prompt when allowOriginIdleOnly=true', async () => {
      const flushPendingRunMessages = vi.fn<() => string | null>().mockReturnValue('Flushed msg');
      const deps = makeMinimalDeps({
        flushPendingRunMessages,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      const result = await buildIterationFeedback(
        makeIteration({
          text: 'Some text',
          toolCalls: [],
        }),
        deps,
      );

      expect(flushPendingRunMessages).toHaveBeenCalledWith({ allowOriginIdleOnly: true });
      expect(result?.feedbackMessages).toContainEqual({ role: 'user', content: 'Flushed msg' });
    });

    it('returns flushed prompt as feedback when no other feedback applies', async () => {
      const flushPendingRunMessages = vi.fn<() => string | null>().mockReturnValue('Flushed msg');
      const deps = makeMinimalDeps({
        flushPendingRunMessages,
        suppressNoToolCallReminderForRun: true,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      const result = await buildIterationFeedback(
        makeIteration({
          text: '',
          toolCalls: [],
        }),
        deps,
      );

      expect(result).toEqual({
        continue: true,
        feedbackMessages: [{ role: 'user', content: 'Flushed msg' }],
      });
    });
  });

  // ── LTM recall ──────────────────────────────────────────────────────────────

  describe('long-term memory recall', () => {
    it('appends LTM text as assistant message when present', async () => {
      const recallFromStep = vi
        .fn<() => Promise<string | null>>()
        .mockResolvedValue('Recalled memory');
      const deps = makeMinimalDeps({
        currentRuntime: {
          mastraId: 'mastra-1',
          longTermMemoryRecall: { recallFromStep },
        },
        suppressNoToolCallReminderForRun: true,
      });

      const result = await buildIterationFeedback(makeIteration(), deps);

      expect(recallFromStep).toHaveBeenCalled();
      expect(result?.feedbackMessages).toContainEqual({
        role: 'assistant',
        content: 'Recalled memory',
      });
    });

    it('skips LTM recall when currentRuntime.longTermMemoryRecall is absent', async () => {
      const deps = makeMinimalDeps({
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
        suppressNoToolCallReminderForRun: true,
      });

      // Should not throw
      const result = await buildIterationFeedback(makeIteration(), deps);
      expect(result).toBeUndefined();
    });

    it('skips LTM recall when recallFromStep returns null', async () => {
      const recallFromStep = vi.fn<() => Promise<string | null>>().mockResolvedValue(null);
      const deps = makeMinimalDeps({
        currentRuntime: {
          mastraId: 'mastra-1',
          longTermMemoryRecall: { recallFromStep },
        },
        suppressNoToolCallReminderForRun: true,
      });

      const result = await buildIterationFeedback(makeIteration(), deps);
      expect(result).toBeUndefined();
    });
  });

  // ── Combined feedback ───────────────────────────────────────────────────────

  describe('combined feedback', () => {
    it('returns flushed prompt + RUN_STOP_REMINDER in correct order', async () => {
      const flushPendingRunMessages = vi.fn<() => string | null>().mockReturnValue('Flushed msg');
      const deps = makeMinimalDeps({
        flushPendingRunMessages,
        suppressNoToolCallReminderForRun: false,
        currentRuntime: { mastraId: 'mastra-1', longTermMemoryRecall: undefined },
      });

      const result = await buildIterationFeedback(
        makeIteration({
          text: 'Visible text',
          toolCalls: [],
        }),
        deps,
      );

      expect(result?.feedbackMessages).toEqual([
        { role: 'user', content: 'Flushed msg' },
        { role: 'user', content: RUN_STOP_REMINDER },
      ]);
    });

    it('combines flushed prompt + LTM text', async () => {
      const flushPendingRunMessages = vi.fn<() => string | null>().mockReturnValue('Flushed msg');
      const recallFromStep = vi.fn<() => Promise<string | null>>().mockResolvedValue('LTM text');
      const deps = makeMinimalDeps({
        flushPendingRunMessages,
        currentRuntime: {
          mastraId: 'mastra-1',
          longTermMemoryRecall: { recallFromStep },
        },
        suppressNoToolCallReminderForRun: true,
      });

      const result = await buildIterationFeedback(makeIteration(), deps);

      expect(result?.feedbackMessages).toEqual([
        { role: 'user', content: 'Flushed msg' },
        { role: 'assistant', content: 'LTM text' },
      ]);
    });
  });
});
