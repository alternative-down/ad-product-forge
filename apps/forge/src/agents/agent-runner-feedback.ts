/**
 * Iteration Feedback — extracted from agent-runner-generate.ts (#2654)
 *
 * Post-iteration decision logic for the generate loop. Given an iteration
 * result (text, tool calls, tool results), decides whether the loop should
 * continue and emits any supplementary feedback messages.
 *
 * Responsibilities:
 * - Loop-stuck detection: notification + stop
 * - Control directives: ignore (suppress reminder) / stop
 * - No-tool-call reminder: nudge when LLM produces visible text without tools
 * - Long-term memory recall: inject recall feedback as assistant message
 * - Flush pending run messages as user feedback
 *
 * Pure in nature — same inputs always produce same outputs given the same
 * runtime state (loopDetector, currentRuntime, etc.).
 */

import { withTimeout } from '../utils/async';
import { extractRunnerControlDirectiveFromIteration } from './agent-runner-control-directives';
import type { AgentNotification } from '../notifications/store';
import {
  buildRecallStepFromIteration,
  didIterationProduceVisibleAssistantText,
} from './agent-runner-iteration-helpers';
import { RUN_STOP_REMINDER } from './system-prompts/run-stop-reminder.js';
import type { GenerateTimeoutHandle } from './agent-runner-generate-timeout';

const LOOP_WARNING_START_COUNT = 3;

export interface BuildIterationFeedbackDeps {
  suppressNoToolCallReminderForRun: boolean;
  setSuppressNoToolCallReminder: (val: boolean) => void;
  setNextStepAt: ((val: number | null) => void) | undefined;
  loopDetector: {
    isStuck(): boolean;
    getSignatureCount(): number;
  };
  loopSignature: string;
  runtime: { id: string };
  notifications: {
    createNotification: (n: { agentId: string; content: string }) => Promise<AgentNotification | null>;
  };
  currentRuntime: {
    mastraId: string;
    longTermMemoryRecall?: {
      recallFromStep: (opts: {
        step: unknown;
        steps: unknown[];
        threadId: string;
        resourceId?: string;
      }) => Promise<string | null>;
    } | null;
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

export type BuildIterationFeedbackInput = {
  iteration: { iteration: number; finishReason: string };
  finishReason: string;
  text: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults: Array<{ name: string; error?: Error }>;
  messages?: unknown[];
  // Legacy aliases for backward compat
  innerIteration?: number;
  innerFinishReason?: string;
};

/**
 * Evaluates a generation iteration and decides whether the generate loop
 * should continue, while building any supplementary feedback messages.
 *
 * Returns:
 * - `{ continue: true, feedbackMessages }` — loop continues with extra messages
 * - `{ continue: false, feedbackMessages: [] }` — loop stops
 * - `undefined` — no feedback, loop proceeds normally
 *
 * The function handles 5 concerns:
 * 1. Stuck loop: notification + stop
 * 2. Stop directive: setNextStepAt(null) + stop
 * 3. No-tool-call reminder: nudge LLM when it produces visible text without tools
 * 4. Flush pending messages: inject pending user messages as feedback
 * 5. LTM recall: inject recall feedback as assistant message
 */
export async function buildIterationFeedback(
  iteration: BuildIterationFeedbackInput,
  deps: BuildIterationFeedbackDeps,
): Promise<
  | { continue: boolean; feedbackMessages: Array<{ role: 'assistant' | 'user'; content: string }> }
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
    const repeatedToolNames = Array.from(
      new Set(iteration.toolCalls.map((toolCall) => toolCall.name)),
    );
    await withTimeout(
      notifications.createNotification({
        agentId: runtime.id,
        content: [
          'Stuck loop detected.',
          'Repeated signature count: ' + loopDetector.getSignatureCount(),
          'The agent repeated the same tool/text pattern and was forced to stop.',
          '',
          `Signature hash: ${loopSignature.slice(0, 128)}`,
          `Repeated tools: ${repeatedToolNames.join(', ') || 'none'}`,
        ].join('\n'),
      }),
      30_000,
      'Agent notification creation timed out for ' + runtime.id,
    );
    setNextStepAt?.(null);
    return {
      continue: false,
      feedbackMessages: [
        {
          role: 'user',
          content:
            'Execution stopped because the same action was repeated without progress. On the next wake, inspect the existing tool result and choose a different action; do not repeat the same call.',
        },
      ],
    };
  }

  const repeatedSignatureCount = loopDetector.getSignatureCount();
  if (repeatedSignatureCount >= LOOP_WARNING_START_COUNT) {
    return {
      continue: true,
      feedbackMessages: [
        {
          role: 'user',
          content: `Loop warning: the same action and result were repeated ${repeatedSignatureCount} times. Do not call it again. Use the result already present in context, explain what is blocking progress, or choose a materially different action.`,
        },
      ],
    };
  }

  if (iteration.toolCalls.length === 0 && ignoredTextRequested) {
    setSuppressNoToolCallReminder(true);
  }

  if (stopRequested) {
    setNextStepAt?.(null);
    return { continue: false, feedbackMessages: [] };
  }

  const producedVisibleAssistantText = didIterationProduceVisibleAssistantText({
    text: iteration.text,
    messages: iteration.messages ?? [],
  });
  const feedbackMessages: Array<{ role: 'assistant' | 'user'; content: string }> = [];
  const flushedPrompt = flushPendingRunMessages({ allowOriginIdleOnly: true });
  if (flushedPrompt !== null && flushedPrompt !== undefined) {
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

  const recallFeedback = await recallLongTermMemory(iteration, currentRuntime);
  if (recallFeedback !== null && recallFeedback !== undefined && recallFeedback.trim()) {
    feedbackMessages.push({ role: 'assistant', content: recallFeedback.trim() });
  }

  if (feedbackMessages.length > 0) {
    return { continue: true, feedbackMessages };
  }

  return undefined;
}

async function recallLongTermMemory(
  iteration: BuildIterationFeedbackInput,
  currentRuntime: BuildIterationFeedbackDeps['currentRuntime'],
) {
  const recallStep = buildRecallStepFromIteration({
    text: iteration.text,
    toolCalls: iteration.toolCalls,
    toolResults: iteration.toolResults.map((toolResult) => ({
      name: toolResult.name,
      result: toolResult.error as unknown,
    })),
  });

  return (
    (await currentRuntime.longTermMemoryRecall?.recallFromStep({
      step: recallStep,
      steps: [recallStep],
      threadId: currentRuntime.mastraId,
      resourceId: currentRuntime.mastraId,
    })) ?? null
  );
}
