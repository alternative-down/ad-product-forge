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
 * - State helpers: isStaleRun, advanceGenerateToken, nextBackoff, resetBackoff, calculateDelayMs
 */

import type { Database } from '../database/schema';
import type { InternalAgentRuntime } from './runtime/types';
import type { AgentContractStore } from './agent-contract-store';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SystemSettingsStore } from '../system-settings/store';
import type { AgentNotificationStore } from '../notifications/store';
import type { AgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';
import type { AgentRunnerUsage } from './agent-runner-usage';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { AgentWakeQueue } from '@forge-runtime/core';
import type { Scheduler } from './agent-runner-scheduler';
import type { MessageManager } from './agent-runner-messages';
import type { LoopDetector } from './agent-runner-loop-detector';

import { delay, withTimeout } from '../utils/async';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { buildStepSystemPrompt, extractRunnerControlDirectiveFromIteration } from './agent-runner-control-directives';
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildRecallStepFromIteration,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  didIterationProduceVisibleAssistantText,
} from './agent-runner-iteration-helpers';
import { createId } from '../utils/id';
import {
  isStaleRun,
  
  resetBackoff,
  calculateDelayMs,
} from './agent-runner-state';
import {
  startGenerateAttempt,
  finishGenerateAttempt,
  invalidateInFlightGenerate,
} from './agent-runner-attempt-lifecycle';
import {
  buildIterationFeedback,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  type BuildIterationFeedbackDeps,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  type BuildIterationFeedbackInput,
} from './agent-runner-feedback';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { readAgentHomeMetricSnapshot } from './agent-home-metrics';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { RUN_STOP_REMINDER } from './agent-runner-wake';
import { forgeDebug } from '@forge-runtime/core';

import {
  FIFTEEN_MINUTES_MS,
  
} from './time-constants';

// ─── Constants ────────────────────────────────────────────────────────────────

import {
  createGenerateTimeoutGuard,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  touchGenerateTimeout,
  clearGenerateTimeout,
  type GenerateTimeoutHandle,
  type ProgressState,
} from './agent-runner-generate-timeout';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GENERATE_TIMEOUT_MS = FIFTEEN_MINUTES_MS;
const GENERATE_TIMEOUT_MAX_ATTEMPTS = 1;
const GENERATE_TIMEOUT_BACKOFF_MS = 5_000;
const GENERATE_MAX_STEPS_PER_RUN = 10_000;
export const RUNNER_AWAIT_TIMEOUT_MS = 30_000;
export const STARTING_RUN_TIMEOUT_MS = RUNNER_AWAIT_TIMEOUT_MS * 2;

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
    (longTermMemoryRecallSystemText?.trim() ?? '') !== ''
      ? {
          role: 'assistant' as const,
          content: (longTermMemoryRecallSystemText ?? "").trim(),
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const runDelayMs = calculateDelayMs(deps.backoffState, {
    hasPendingMessages: false,
    stopRequested: false,
    hasNewEvents: false,
  });
  let suppressNoToolCallReminderForRun = false;

  for (let attempt = 1; attempt <= GENERATE_TIMEOUT_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const generateToken = startGenerateAttempt(deps, controller);
    const timeout = createGenerateTimeoutGuard(controller);

    deps.markGenerateProgress(timeout, controller, {
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

      const result = await (Promise.race([
        (deps.currentRuntime as any).generate(
          effectivePromptText,
          {
            system: systemPrompt,
            abortSignal: controller.signal,
            maxSteps: GENERATE_MAX_STEPS_PER_RUN,
            runId: deps.activeRunId ?? `${deps.runtime.id}:${runEpoch}`,
          },
        ),
        timeout.promise,
      ]) as any);

      clearGenerateTimeout(timeout);
      finishGenerateAttempt(generateToken, controller, deps);

      const { inputTokens = 0, outputTokens = 0, steps = [] } = result ?? {};

      // Record usage
      void withTimeout(
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
      void withTimeout(
        deps.homeMetricSnapshots.recordSnapshot({
          agentId: deps.runtime.id,
          stepId: createId(),
          stepCreatedAt: Date.now(),
          snapshot: deps.currentRuntime,
        }),
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
          toolCalls: steps.flatMap((s: any) => s.toolCalls ?? []) as Array<{
            name: string;
            args: Record<string, unknown>;
          }>,
          toolResults: steps.flatMap((s: any) =>
            (s.toolResults ?? []).map((tr: any) => ({ name: tr.name, error: tr.error as Error })),
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
          currentRuntime: {
    mastraId: deps.currentRuntime.mastraId,
    longTermMemoryRecall: deps.currentRuntime.longTermMemoryRecall,
  },
          flushPendingRunMessages: deps.flushPendingRunMessages,
          markGenerateProgress: deps.markGenerateProgress,
          controller,
          isStopped: deps.isStopped,
        },
      );

      if (iterationFeedback?.continue !== true) {
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
        toolCalls: steps.flatMap((s: any) => s.toolCalls ?? []) as Array<{
          name: string;
          args: Record<string, unknown>;
        }>,
        toolResults: steps.flatMap((s: any) =>
          (s.toolResults ?? []).map((tr: any) => ({ name: tr.name, error: tr.error as Error })),
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
      resetBackoff(deps.backoffState);
      invalidateInFlightGenerate(deps);
    }
  }

  return undefined;
}
