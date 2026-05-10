/**
 * Agent Generation Loop — extracted from agent-runner.ts (#1718)
 *
 * Responsible for the LLM generate loop:
 * - generateWithTimeoutRetries: main generation loop with retries and timeout
 * - buildIterationFeedback: post-iteration processing (loop detection, LTM, stop directives)
 * - Timeout management: createGenerateTimeoutGuard, touchGenerateTimeout, clearGenerateTimeout
 * - Attempt lifecycle: startGenerateAttempt, finishGenerateAttempt, invalidateInFlightGenerate
 *
 * Dependencies (passed as `deps`):
 * - Core runtime: runtime, db, currentRuntime, store, usage, notifications
 * - State: epochState (activeRunEpoch, activeStepEpoch, activeGenerateToken, activeRunId),
 *          backoffState (backoffMs, instant, nextStepAt), loopState, progressState
 * - Messaging: messageManager, runLastMessages, flushPendingRunMessages
 * - Scheduling: scheduler
 * - Config: loadAgentContextInstructions (from agent-runner-context-loaders.ts)
 * - Constants: GENERATE_TIMEOUT_MS, GENERATE_TIMEOUT_MAX_ATTEMPTS, GENERATE_TIMEOUT_BACKOFF_MS,
 *              GENERATE_MAX_STEPS_PER_RUN, RUNNER_AWAIT_TIMEOUT_MS, RUN_STOP_REMINDER
 * - Helpers: buildStepSystemPrompt, extractRunnerControlDirectiveFromIteration, etc.
 * - State helpers: isStaleRun, advanceGenerateToken, nextBackoff, resetBackoffState, calculateDelayMs
 */

import type { Database } from '../database/schema';
import type { InternalAgentRuntime } from './runtime/types';
import type { AgentContractStore } from './agent-contract-store';
import type { SystemSettingsStore } from '../system-settings/store';
import type { AgentNotificationStore } from '../notifications/store';
import type { AgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';
import type { AgentRunnerUsage } from './agent-runner-usage';
import type { AgentWakeQueue } from '@forge-runtime/core';
import type { Scheduler } from './agent-runner-scheduler';
import type { MessageManager } from './agent-runner-messages';
import type { LoopDetector } from './agent-runner-loop-detector';

import { delay, withTimeout } from '../utils/async';
import {
  buildStepSystemPrompt,
  extractRunnerControlDirectiveFromIteration,
  buildRecallStepFromIteration,
  didIterationProduceVisibleAssistantText,
} from './agent-runner-helpers';
import {
  isStaleRun,
  advanceGenerateToken,
  nextBackoff,
  resetBackoffState,
  calculateDelayMs,
} from './agent-runner-state';
import { readAgentHomeMetricSnapshot } from './agent-home-metrics';
import { RUN_STOP_REMINDER } from './agent-runner-wake';
import { forgeDebug } from '@forge-runtime/core';

import {
  FIFTEEN_MINUTES_MS,
  ONE_MINUTE_MS,
} from './time-constants';

// ─── Constants ────────────────────────────────────────────────────────────────

const GENERATE_TIMEOUT_MS = FIFTEEN_MINUTES_MS;
const GENERATE_TIMEOUT_MAX_ATTEMPTS = 1;
const GENERATE_TIMEOUT_BACKOFF_MS = 5_000;
const GENERATE_MAX_STEPS_PER_RUN = 10_000;
const RUNNER_AWAIT_TIMEOUT_MS = 30_000;

// ─── Dependencies interface ─────────────────────────────────────────────────────

interface EpochState {
  activeRunEpoch: number;
  activeStepEpoch: number;
  activeGenerateToken: number;
  activeRunId: string | null;
}

interface BackoffState {
  backoffMs: number;
  instant: boolean;
  nextStepAt: number | null;
}

interface ProgressState {
  lastStepStartedAt: number | null;
  lastStepStage: string | null;
  lastGenerateProgress: {
    stage: string;
    at: number;
    detail: Record<string, unknown> | null;
  } | null;
}

interface LoopState {
  lastLoopSignature: string | null;
  repeatedLoopCount: number;
}

export interface GenerateDeps {
  // Core runtime
  db: Database;
  runtime: InternalAgentRuntime;
  currentRuntime: InternalAgentRuntime;
  store: AgentContractStore;
  usage: AgentRunnerUsage;
  notifications: AgentNotificationStore;
  homeMetricSnapshots: AgentHomeMetricSnapshotStore;

  // Messaging
  messageManager: MessageManager;
  runLastMessages: number;
  flushPendingRunMessages: (opts: { allowOriginIdleOnly: boolean }) => string | null;

  // Scheduling
  scheduler: Scheduler;

  // State
  epochState: EpochState;
  backoffState: BackoffState;
  progressState: ProgressState;
  loopState: LoopState;
  loopDetector: LoopDetector;

  // Abort controller ref
  currentGenerateAbortController: AbortController | null;
  setCurrentGenerateAbortController: (c: AbortController | null) => void;

  // Progress tracking
  markGenerateProgress: (
    timeout: GenerateTimeoutHandle,
    controller: AbortController,
    info: { stage: string; detail: Record<string, unknown> },
  ) => void;

  // Backoff control
  setBackoffMs: (ms: number) => void;
  setInstant: (v: boolean) => void;
  setNextStepAt: (v: number | null) => void;

  // Loop state
  setLoopSignature: (sig: string | null) => void;
  loopSignature: string;

  // Run state
  activeRunId: string | null;

  // Context loading
  loadAgentContextInstructions: (
    currentRuntime: InternalAgentRuntime,
    db: Database,
  ) => Promise<string | null>;

  // Stop flag
  isStopped: () => boolean;
}

// ─── Timeout handle ───────────────────────────────────────────────────────────

export interface GenerateTimeoutHandle {
  promise: Promise<never>;
  timeoutId: NodeJS.Timeout | null;
  rejectTimeout: ((error: Error) => void) | null;
}

function createGenerateTimeoutGuard(_controller: AbortController): GenerateTimeoutHandle {
  let timeoutId: NodeJS.Timeout | null = null;
  let rejectTimeout: ((error: Error) => void) | null = null;
  const promise = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });

  return {
    promise,
    get timeoutId() {
      return timeoutId;
    },
    set timeoutId(value: NodeJS.Timeout | null) {
      timeoutId = value;
    },
    rejectTimeout,
  };
}

function touchGenerateTimeout(
  timeout: GenerateTimeoutHandle,
  controller: AbortController,
  lastStepStage: string | null,
  lastGenerateProgress: ProgressState['lastGenerateProgress'],
) {
  if (timeout.timeoutId) {
    clearTimeout(timeout.timeoutId);
  }

  timeout.timeoutId = setTimeout(() => {
    const timeoutError = new Error(
      `Agent generate timed out after ${GENERATE_TIMEOUT_MS}ms without iteration progress`,
    );
    (timeoutError as Error & { context?: Record<string, unknown> }).context = {
      lastStepStage,
      lastGenerateProgress,
    };
    controller.abort(timeoutError);
    timeout.rejectTimeout?.(timeoutError);
  }, GENERATE_TIMEOUT_MS);
}

function clearGenerateTimeout(timeout: GenerateTimeoutHandle) {
  if (!timeout.timeoutId) {
    return;
  }
  clearTimeout(timeout.timeoutId);
  timeout.timeoutId = null;
}

// ─── Attempt lifecycle ────────────────────────────────────────────────────────

function startGenerateAttempt(
  deps: GenerateDeps,
  controller: AbortController,
): number {
  advanceGenerateToken(deps.epochState);
  deps.epochState.activeGenerateToken;
  deps.setCurrentGenerateAbortController(controller);
  return deps.epochState.activeGenerateToken;
}

function finishGenerateAttempt(
  generateToken: number,
  controller: AbortController,
  deps: GenerateDeps,
) {
  if (deps.epochState.activeGenerateToken === generateToken) {
    deps.setCurrentGenerateAbortController(null);
  }
  controller.abort();
}

function invalidateInFlightGenerate(deps: GenerateDeps) {
  advanceGenerateToken(deps.epochState);
  deps.currentGenerateAbortController?.abort(
    new Error('Agent generate invalidated'),
  );
  deps.setCurrentGenerateAbortController(null);
}

// ─── buildIterationFeedback ───────────────────────────────────────────────────

export interface BuildIterationFeedbackDeps {
  suppressNoToolCallReminderForRun: boolean;
  setSuppressNoToolCallReminder: (val: boolean) => void;
  setNextStepAt: (val: number | null) => void;
  loopDetector: LoopDetector;
  loopSignature: string;
  runtime: { id: string };
  notifications: { createNotification: (n: { agentId: string; content: string }) => Promise<unknown> };
  currentRuntime: {
    mastraId: string;
    longTermMemoryRecall?: {
      recallFromStep: (opts: {
        step: unknown; steps: unknown[]; threadId: string; resourceId: string;
      }) => Promise<string | null>;
    };
  };
  flushPendingRunMessages: (opts: { allowOriginIdleOnly: boolean }) => string | null;
  markGenerateProgress: (
    timeout: GenerateTimeoutHandle,
    controller: AbortController,
    info: { stage: string; detail: Record<string, unknown> },
  ) => void;
  controller: AbortController;
  isStopped: () => boolean;
}

export async function buildIterationFeedback(
  iteration: {
    iteration: { iteration: number; finishReason: string };
    finishReason: string;
    text: string;
    toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
    toolResults: Array<{ name: string; error?: Error }>;
  },
  deps: BuildIterationFeedbackDeps,
): Promise<
  | {
    continue: boolean;
    feedbackMessages: Array<{ role: 'assistant' | 'user'; content: string }>;
  }
  | undefined
> {
  const {
    suppressNoToolCallReminderForRun,
    setSuppressNoToolCallReminder,
    setNextStepAt,
    loopDetector,
    loopSignature,
    runtime,
    notifications,
    currentRuntime,
    flushPendingRunMessages,
  } = deps;

  const controlDirective = extractRunnerControlDirectiveFromIteration(iteration);
  const ignoredTextRequested = controlDirective === 'ignore';
  const stopRequested = controlDirective === 'stop';

  if (loopDetector.isStuck()) {
    await withTimeout(
      notifications.createNotification({
        agentId: runtime.id,
        content: [
          'Stuck loop detected.',
          'Repeated signature count: ' + loopDetector.getSignatureCount(),
          'The agent repeated the same tool/text pattern and was forced to stop.',
          '',
          'Signature:',
          loopSignature,
        ].join('\n'),
      }),
      RUNNER_AWAIT_TIMEOUT_MS,
      'Agent notification creation timed out for ' + runtime.id,
    );
    setNextStepAt(null);
    return { continue: false, feedbackMessages: [] };
  }

  if (iteration.toolCalls.length === 0 && ignoredTextRequested) {
    setSuppressNoToolCallReminder(true);
  }

  if (stopRequested) {
    setNextStepAt(null);
    return { continue: false, feedbackMessages: [] };
  }

  const producedVisibleAssistantText = didIterationProduceVisibleAssistantText(iteration);
  const feedbackMessages: Array<{ role: 'assistant' | 'user'; content: string }> = [];
  const flushedPrompt = flushPendingRunMessages({ allowOriginIdleOnly: true });
  if (flushedPrompt) {
    feedbackMessages.push({ role: 'user', content: flushedPrompt });
  }
  if (
    iteration.toolCalls.length === 0 &&
    producedVisibleAssistantText &&
    !stopRequested &&
    !suppressNoToolCallReminderForRun
  ) {
    feedbackMessages.push({ role: 'user', content: RUN_STOP_REMINDER });
  }

  const recallStep = buildRecallStepFromIteration(iteration);
  const recallFeedback = await currentRuntime.longTermMemoryRecall?.recallFromStep({
    step: recallStep,
    steps: [recallStep],
    threadId: currentRuntime.mastraId,
    resourceId: currentRuntime.mastraId,
  }) ?? null;
  if (recallFeedback?.trim()) {
    feedbackMessages.push({ role: 'assistant', content: recallFeedback.trim() });
  }
  if (feedbackMessages.length > 0) {
    return { continue: true, feedbackMessages };
  }

  return undefined;
}

// ─── Main generation function ──────────────────────────────────────────────────

export async function generateWithTimeoutRetries(
  promptText: string,
  runEpoch: number,
  contractId: string,
  contract: {
    id: string;
    budgetUsd: number;
    endsAt: number;
  },
  longTermMemoryRecallSystemText: string | null,
  deps: GenerateDeps,
): Promise<{
  text: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults: Array<{ name: string; error?: Error }>;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
} | undefined> {
  const effectivePromptText = [
    longTermMemoryRecallSystemText?.trim()
      ? {
          role: 'assistant' as const,
          content: longTermMemoryRecallSystemText.trim(),
        }
      : null,
    promptText.trim()
      ? {
          role: 'user' as const,
          content: promptText.trim(),
        }
      : null,
  ].filter(
    (value): value is { role: 'assistant' | 'user'; content: string } =>
      Boolean(value),
  );

  const runDelayMs = calculateDelayMs(deps.backoffState);
  let suppressNoToolCallReminderForRun = false;

  for (let attempt = 1; attempt <= GENERATE_TIMEOUT_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const generateToken = startGenerateAttempt(deps, controller);
    const timeout = createGenerateTimeoutGuard(controller);

    markGenerateProgress(timeout, controller, {
      stage: 'generate-started',
      detail: {
        attempt,
        runId: deps.activeRunId ?? `${deps.runtime.id}:${runEpoch}`,
        maxSteps: GENERATE_MAX_STEPS_PER_RUN,
      },
    });

    try {
      forgeDebug({
        scope: 'agent-runner',
        level: 'debug',
        runtimeId: deps.runtime.id,
        message: 'preparing runtime context before generate',
      });
      const agentContextInstructions = await deps.loadAgentContextInstructions(
        deps.currentRuntime,
        deps.db,
      );
      const systemPrompt = buildStepSystemPrompt({
        agentContextInstructions,
      });
      forgeDebug({
        scope: 'agent-runner',
        level: 'debug',
        runtimeId: deps.runtime.id,
        message: 'runtime context ready before generate',
      });
      forgeDebug({
        scope: 'agent-runner',
        level: 'info',
        runtimeId: deps.runtime.id,
        message: `generate start (attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS})`,
      });

      const progressTimeout = timeout;
      const progressController = controller;

      const result = await Promise.race([
        deps.currentRuntime.generate(
          systemPrompt,
          effectivePromptText,
          {
            abortSignal: controller.signal,
            maxSteps: GENERATE_MAX_STEPS_PER_RUN,
            runId: deps.activeRunId ?? `${deps.runtime.id}:${runEpoch}`,
          },
        ),
        timeout.promise,
      ] as Parameters<typeof deps.currentRuntime.generate> extends [unknown, unknown, { abortSignal: infer S }]
        ? [ReturnType<typeof deps.currentRuntime.generate>, Promise<never>]
        : never[] as never[]);

      clearGenerateTimeout(timeout);
      finishGenerateAttempt(generateToken, controller, deps);

      const { inputTokens = 0, outputTokens = 0, steps = [] } = result ?? {};

      // Record usage
      withTimeout(
        deps.usage.recordAgentStep(
          contractId,
          inputTokens,
          inputTokens, // cachedInputTokens — use inputTokens as approximation
          outputTokens,
        ),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent usage recording timed out for ${deps.runtime.id}`,
      );

      // Record home metric snapshot
      withTimeout(
        deps.homeMetricSnapshots.recordSnapshot(
          deps.runtime.id,
          deps.currentRuntime,
        ),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent home metric snapshot timed out for ${deps.runtime.id}`,
      );

      if (isStaleRun(deps.epochState, runEpoch)) {
        return undefined;
      }

      // Build feedback
      const iterationFeedback = await buildIterationFeedback(
        {
          iteration: { iteration: steps.length, finishReason: result?.finishReason ?? 'unknown' },
          finishReason: result?.finishReason ?? 'unknown',
          text: result?.text ?? '',
          toolCalls: steps.flatMap((s) => s.toolCalls ?? []) as Array<{
            name: string;
            args: Record<string, unknown>;
          }>,
          toolResults: steps.flatMap((s) =>
            (s.toolResults ?? []).map((tr) => ({ name: tr.name, error: tr.error as Error })),
          ) as Array<{ name: string; error?: Error }>,
        },
        {
          suppressNoToolCallReminderForRun,
          setSuppressNoToolCallReminder: (v) => {
            suppressNoToolCallReminderForRun = v;
          },
          setNextStepAt: (v) => {
            deps.setNextStepAt(v);
          },
          loopDetector: deps.loopDetector,
          loopSignature: deps.loopSignature,
          runtime: deps.runtime,
          notifications: deps.notifications,
          currentRuntime: deps.currentRuntime,
          flushPendingRunMessages: deps.flushPendingRunMessages,
          markGenerateProgress: deps.markGenerateProgress,
          controller,
          isStopped: deps.isStopped,
        },
      );

      if (!iterationFeedback?.continue) {
        return undefined;
      }

      forgeDebug({
        scope: 'agent-runner',
        level: 'info',
        runtimeId: deps.runtime.id,
        message: `generate completed (attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS})`,
      });

      return {
        text: result?.text ?? '',
        toolCalls: steps.flatMap((s) => s.toolCalls ?? []) as Array<{
          name: string;
          args: Record<string, unknown>;
        }>,
        toolResults: steps.flatMap((s) =>
          (s.toolResults ?? []).map((tr) => ({ name: tr.name, error: tr.error as Error })),
        ) as Array<{ name: string; error?: Error }>,
        finishReason: result?.finishReason ?? 'unknown',
        inputTokens,
        outputTokens,
      };
    } catch (err) {
      clearGenerateTimeout(timeout);
      finishGenerateAttempt(generateToken, controller, deps);

      if (isStaleRun(deps.epochState, runEpoch)) {
        return undefined;
      }

      const error = err as Error & { code?: string };

      if (error?.code === 'ABORT_ERROR' || error?.name === 'AbortError') {
        forgeDebug({
          scope: 'agent-runner',
          level: 'info',
          runtimeId: deps.runtime.id,
          message: 'generate aborted (stale or cancelled)',
        });
        return undefined;
      }

      forgeDebug({
        scope: 'agent-runner',
        level: 'error',
        runtimeId: deps.runtime.id,
        message: 'generate failed',
        context: { error: error?.message ?? String(err) },
      });

      // Back off on retryable error
      deps.setBackoffMs(GENERATE_TIMEOUT_BACKOFF_MS);
      await delay(GENERATE_TIMEOUT_BACKOFF_MS);
      resetBackoffState(deps.backoffState);
      invalidateInFlightGenerate(deps);
    }
  }

  return undefined;
}