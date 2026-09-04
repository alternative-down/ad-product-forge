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
 * - Constants: GENERATE_TIMEOUT_MAX_ATTEMPTS, GENERATE_TIMEOUT_BACKOFF_MS,
 * - Helpers: buildStepSystemPrompt, extractRunnerControlDirectiveFromIteration, etc.
 * - State helpers: isStaleRun, advanceGenerateToken, nextBackoff, resetBackoff, calculateDelayMs
 */

import type { Database } from '../database/client';
import type { InternalAgentRuntime } from './runtime/types';
import type { AgentContractStore } from './agent-contract-store';
import type { AgentNotificationStore } from '../notifications/store';
import type { AgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';
import type { AgentRunnerUsage } from './agent-runner-usage';
import type { Scheduler } from './agent-runner-scheduler';
import type { MessageManager } from './agent-runner-messages';
import type { RuntimeGenerateResult, RuntimeIteration } from './runtime/types';
import type { AgentRunnerSnapshot } from './agent-runner-snapshot';

import { delay, withTimeout } from '../utils/async';
import { buildStepSystemPrompt } from './agent-runner-control-directives';
import { isStaleRun, resetBackoff } from './agent-runner-state';
import {
  startGenerateAttempt,
  finishGenerateAttempt,
  invalidateInFlightGenerate,
} from './agent-runner-attempt-lifecycle';
import { buildIterationFeedback } from './agent-runner-feedback';
import { buildIterationLoopSignature } from './agent-runner-iteration-helpers';
import { readAgentHomeMetricSnapshot } from './agent-home-metrics';
import { agentRunnerDebug } from './agent-runner-debug';
import { createLoopDetector } from './agent-runner-loop-detector';
import { errorMsg } from './error-formatting';
import { FIVE_SECONDS_MS, THIRTY_SECONDS_MS, TWO_SECONDS_MS } from './time-constants';

type AgentStepWithFeedback = {
  response?: { uiMessages?: Array<{ parts?: unknown[] }> };
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ name: string; error?: Error }>;
};

type IterationFeedbackSummary = {
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults: Array<{ name: string; error?: Error }>;
};

/**
 * Extract tool calls and tool results from generate-loop step array.
 *
 * RuntimeGenerateResult.steps declares only response and uiMessages, but the
 * runtime stream emits toolCalls and toolResults as sibling fields.
 * Centralizing the mapping here eliminates duplicated typed casts at the
 * two call sites that previously needed them.
 */
export function mapStepsToFeedback(
  steps: ReadonlyArray<AgentStepWithFeedback>,
): IterationFeedbackSummary {
  return {
    toolCalls: steps.flatMap((s) => s.toolCalls ?? []),
    toolResults: steps.flatMap((s) =>
      (s.toolResults ?? []).map((tr) => ({
        name: tr.name,
        error: tr.error,
      })),
    ),
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

import {
  createGenerateTimeoutGuard,
  clearGenerateTimeout,
  type GenerateTimeoutHandle,
  type ProgressState,
} from './agent-runner-generate-timeout';

export function isAbortedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  return (
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string' &&
    (err as { code: string }).code === 'ABORT_ERROR'
  );
}

const GENERATE_TIMEOUT_MAX_ATTEMPTS = 1;
const GENERATE_TIMEOUT_BACKOFF_MS = FIVE_SECONDS_MS;
const EVENT_LOOP_PROBE_INTERVAL_MS = FIVE_SECONDS_MS;
const EVENT_LOOP_LAG_WARNING_MS = TWO_SECONDS_MS;

function startGenerateEventLoopProbe(runtimeId: string) {
  let expectedAt = Date.now() + EVENT_LOOP_PROBE_INTERVAL_MS;
  const interval = setInterval(() => {
    const now = Date.now();
    const lagMs = now - expectedAt;
    expectedAt = now + EVENT_LOOP_PROBE_INTERVAL_MS;

    if (lagMs >= EVENT_LOOP_LAG_WARNING_MS) {
      agentRunnerDebug('warn', 'event loop blocked during generate', { runtimeId, lagMs });
    }
  }, EVENT_LOOP_PROBE_INTERVAL_MS);

  return () => clearInterval(interval);
}
const GENERATE_MAX_STEPS_PER_RUN = 3;
export const RUNNER_AWAIT_TIMEOUT_MS = THIRTY_SECONDS_MS;
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
  workspaceBasePath?: string;
  getRunnerSnapshot: () => AgentRunnerSnapshot;

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
  loopDetector: {
    register(signature: string): number;
    reset(): void;
    isStuck(): boolean;
    getSignatureCount(): number;
  };

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
  deps: GenerateDeps,
): Promise<
  | {
      text: string;
      toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
      toolResults: Array<{ name: string; error?: Error }>;
      finishReason: string;
      inputTokens: number;
      outputTokens: number;
    }
  | undefined
> {
  const effectivePromptText = [
    promptText.trim()
      ? {
          role: 'user' as const,
          content: promptText.trim(),
        }
      : null,
  ].filter((value): value is { role: 'user'; content: string } => value !== null);

  const runDelayMs = Math.max(await deps.scheduler.planNextStepDelay(), 0);
  let suppressNoToolCallReminderForRun = false;
  const loopDetector = createLoopDetector({
    lastLoopSignature: null,
    repeatedLoopCount: 0,
  });
  for (let attempt = 1; attempt <= GENERATE_TIMEOUT_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const generateToken = startGenerateAttempt(deps, controller);
    const timeout = createGenerateTimeoutGuard(controller);
    deps.markGenerateProgress(timeout, controller, {
      stage: 'generate-started',
      detail: {
        attempt,
        runId: String(deps.activeRunId ?? `${deps.runtime.id}:${runEpoch}`),
        maxSteps: GENERATE_MAX_STEPS_PER_RUN,
      },
    });

    try {
      agentRunnerDebug('debug', 'preparing runtime context before generate', {
        runtimeId: deps.runtime.id,
      });
      const agentContextInstructions = await deps.loadAgentContextInstructions(
        deps.currentRuntime,
        deps.db,
      );
      const systemPrompt = buildStepSystemPrompt({
        agentContextInstructions,
      });
      agentRunnerDebug('debug', 'runtime context ready before generate', {
        runtimeId: deps.runtime.id,
      });
      const memoryUsage = process.memoryUsage();
      agentRunnerDebug(
        'info',
        `generate start (attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS})`,
        {
          runtimeId: deps.runtime.id,
          rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
          heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          externalMb: Math.round(memoryUsage.external / 1024 / 1024),
        },
      );
      const stopEventLoopProbe = startGenerateEventLoopProbe(deps.runtime.id);

      const iterationState: { current: RuntimeIteration | null } = { current: null };
      const result = await Promise.race<RuntimeGenerateResult | null>([
        deps.currentRuntime.agent.generate(effectivePromptText, {
          system: systemPrompt ?? undefined,
          abortSignal: controller.signal,
          maxSteps: GENERATE_MAX_STEPS_PER_RUN,
          runId: deps.activeRunId !== null ? deps.activeRunId : `${deps.runtime.id}:${runEpoch}`,
          savePerStep: true,
          memory: {
            thread: deps.currentRuntime.mastraId,
            resource: deps.currentRuntime.mastraId,
            options: {
              lastMessages: deps.runLastMessages,
            },
          },
          providerOptions: {
            anthropic: {
              thinking: { type: 'enabled', budgetTokens: 2_000 },
            },
          },
          prepareStep: async ({ stepNumber }) => {
            deps.markGenerateProgress(timeout, controller, {
              stage: 'prepare-step',
              detail: { stepNumber },
            });

            if (stepNumber > 0 && runDelayMs > 0) {
              await delay(runDelayMs);
            }
          },
          onStepFinish: async (stepResult) => {
            deps.markGenerateProgress(timeout, controller, {
              stage: 'step-finished',
              detail: { usage: stepResult.usage ?? null },
            });
            deps.progressState.lastStepStage = 'recording-agent-usage';
            const { inputTokens, cachedInputTokens, outputTokens } =
              deps.usage.getUsageFromResult(stepResult);
            const recordedStep = await withTimeout(
              deps.usage.recordAgentStep(contractId, inputTokens, cachedInputTokens, outputTokens),
              RUNNER_AWAIT_TIMEOUT_MS,
              `Agent usage recording timed out for ${deps.runtime.id}`,
            );

            if (deps.workspaceBasePath === undefined || deps.workspaceBasePath.length === 0) {
              return;
            }

            const snapshot = await readAgentHomeMetricSnapshot({
              db: deps.db,
              workspaceBasePath: deps.workspaceBasePath,
              agentId: deps.currentRuntime.id,
              runtime: deps.currentRuntime,
              runnerSnapshot: deps.getRunnerSnapshot(),
            });

            if (snapshot) {
              await deps.homeMetricSnapshots.recordSnapshot({
                agentId: deps.currentRuntime.id,
                stepId: recordedStep.stepId,
                stepCreatedAt: recordedStep.createdAt,
                snapshot: {
                  ...snapshot,
                  omTrace: stepResult.omTrace ?? [],
                },
              });
            }
          },
          onIterationComplete: async (iteration) => {
            iterationState.current = iteration;
            const signature = buildIterationLoopSignature({
              text: iteration.text,
              toolCalls: iteration.toolCalls,
              toolResults: iteration.toolResults,
            });
            deps.setLoopSignature(signature);
            if (signature === null) {
              loopDetector.reset();
            } else {
              const repeatedSignatureCount = loopDetector.register(signature);
              agentRunnerDebug('debug', 'loop signature registered', {
                runtimeId: deps.runtime.id,
                iteration: iteration.iteration,
                repeatedSignatureCount,
                signature: signature.slice(0, 500),
              });
            }
            deps.markGenerateProgress(timeout, controller, {
              stage: 'iteration-completed',
              detail: {
                iteration: iteration.iteration,
                finishReason: iteration.finishReason,
                toolCallCount: iteration.toolCalls.length,
              },
            });

            return await buildIterationFeedback(
              {
                iteration: {
                  iteration: iteration.iteration,
                  finishReason: iteration.finishReason,
                },
                finishReason: iteration.finishReason,
                text: iteration.text,
                toolCalls: iteration.toolCalls.map(({ name, args }) => ({ name, args })),
                toolResults: iteration.toolResults.map(({ name, error }) => ({ name, error })),
                messages: iteration.messages,
              },
              {
                suppressNoToolCallReminderForRun,
                setSuppressNoToolCallReminder: (value) => {
                  suppressNoToolCallReminderForRun = value;
                },
                setNextStepAt: deps.setNextStepAt,
                loopDetector,
                loopSignature: signature ?? '',
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
          },
        }),
        timeout.promise,
      ]).finally(stopEventLoopProbe);

      clearGenerateTimeout(timeout);
      finishGenerateAttempt(generateToken, controller, deps);

      const { usage: { inputTokens = 0, outputTokens = 0 } = {} } = result ?? {};

      if (isStaleRun(deps.epochState, runEpoch)) {
        return undefined;
      }

      agentRunnerDebug(
        'info',
        `generate completed (attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS})`,
        { runtimeId: deps.runtime.id },
      );

      return {
        text: iterationState.current?.text ?? result?.text ?? '',
        toolCalls:
          iterationState.current?.toolCalls.map(({ name, args }) => ({ name, args })) ?? [],
        toolResults:
          iterationState.current?.toolResults.map(({ name, error }) => ({ name, error })) ?? [],
        finishReason: iterationState.current?.finishReason ?? result?.finishReason ?? 'unknown',
        inputTokens,
        outputTokens,
      };
    } catch (err) {
      clearGenerateTimeout(timeout);
      finishGenerateAttempt(generateToken, controller, deps);

      if (isStaleRun(deps.epochState, runEpoch)) {
        return undefined;
      }

      if (isAbortedError(err)) {
        agentRunnerDebug('info', 'generate aborted (stale or cancelled)', {
          runtimeId: deps.runtime.id,
        });
        return undefined;
      }

      agentRunnerDebug('error', 'generate failed', {
        runtimeId: deps.runtime.id,
        error: errorMsg(err),
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
