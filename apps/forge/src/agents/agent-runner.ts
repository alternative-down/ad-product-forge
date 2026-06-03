import { buildRunnerSnapshot } from './agent-runner-snapshot';
import { createId } from '../utils/id';
import { createAgentWakeQueue, forgeDebug } from '@forge-runtime/core';
import type { AgentWakeEvent } from '@forge-runtime/core';

import type { InternalAgentRuntime } from './runtime/types';
import { createAgentContractStore } from './agent-contract-store';

import type { Database } from '../database/schema';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentNotificationStore } from '../notifications/store';
import { createAgentRunnerUsage, type AgentRunnerUsage } from './agent-runner-usage';
import { createAgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';
import { formatPendingRunEvents } from './agent-runner-wake';
import { createLoopManager } from './agent-runner-loop-manager';
import { createRunnerMessageManager } from './agent-runner-message-manager';

import {
  errorMsg,
  formatAbsentExecutionError,
} from './error-formatting';
import { extractRunnerControlDirective } from './agent-runner-control-directives';

import { withTimeout } from '../utils/async';

import { advanceGenerateToken } from './agent-runner-state';
import { calculateBudgetDelayMs, nextExponentialBackoffMs } from './agent-runner-delay';
import { loadAgentContextInstructions } from './agent-runner-context-loaders';
import {
  generateWithTimeoutRetries,
  RUNNER_AWAIT_TIMEOUT_MS,
} from './agent-runner-generate';

import { createScheduler, type Scheduler, type SchedulerState } from './agent-runner-scheduler';

import { ONE_MINUTE_MS } from './time-constants';
const DEFAULT_RUN_LAST_MESSAGES = 20;
const FULL_MEMORY_LOAD_LAST_MESSAGES = Number.MAX_SAFE_INTEGER;
export function createAgentRunner(
  db: Database,
  runtime: InternalAgentRuntime,
  options: {
    reloadRuntime?: () => Promise<InternalAgentRuntime>;
    onRuntimeReloaded?: (runtime: InternalAgentRuntime) => void;
    workspaceBasePath?: string;
  } = {},
) {
  const store = createAgentContractStore(db);
  const systemSettings = createSystemSettingsStore(db);
  const notifications = createAgentNotificationStore(db);
  const homeMetricSnapshots = createAgentHomeMetricSnapshotStore(db);
  let currentRuntime = runtime;
  let usage = createAgentRunnerUsage({ store, runtime: currentRuntime });
  const wakeQueue = createAgentWakeQueue({
    label: currentRuntime.id,
    execute,
  });

  const schedulerState: SchedulerState = {
    nextStepAt: null,
    backoffMs: ONE_MINUTE_MS,
    instant: false,
    activeRunEpoch: 0,
    activeStepEpoch: 0,
    activeGenerateToken: 0,
    isStopped: false,
  };
  const scheduler = createScheduler(schedulerState, {
    getSystemSettings: () => systemSettings.getSettings(),
    getRunnableContract: (id) => store.getRunnableContract(id),
    getContractSpend: (id) => store.getContractSpend(id),
    estimateStepCostUsd: () => usage.estimateStepCostUsd(),
    runtimeId: runtime.id,
    setExecutionState: (id, state) => store.setExecutionState(id, state),
  });
  const timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let startingRun = false;
  let startingRunStartedAt: number | null = null;
  let executing = false;
  let lastWakeStartedAt: number | null = null;
  let lastStepStartedAt: number | null = null;
  let lastStepStage: string | null = null;
  let lastGenerateProgress: {
    stage: string;
    at: number;
    detail: Record<string, unknown> | null;
  } | null = null;
  const loopManager = createLoopManager({ lastLoopSignature: null, repeatedLoopCount: 0 });
  let activeRunId: string | null = null;
  let currentGenerateAbortController: AbortController | null = null;
  let runLastMessages = DEFAULT_RUN_LAST_MESSAGES;
  let pendingLongTermMemoryRecallSystemText: string | null = null;
  const messageManager = createRunnerMessageManager(
    {
      flushedRunEventKeys: new Set<string>(),
      flushedRunEventKeyOrder: [] as string[],
      currentFlushSettings: {
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: true,
      },
      pendingRunMessages: new Map<string, AgentWakeEvent>(),
    },
    formatPendingRunEvents,
  );

  currentRuntime.onReceiveMessage(notifyExternalEvent);

  async function reloadRuntimeForNewRun(_runEpoch: number) {
    if (!options.reloadRuntime) {
      return;
    }

    const previousRuntime = currentRuntime;
    const nextRuntime = await withTimeout(
      options.reloadRuntime(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent runtime reload timed out for ${runtime.id}`,
    );

    if (isStaleRun(_runEpoch)) {
      await withTimeout(
        nextRuntime.dispose(),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent runtime disposal timed out for ${runtime.id}`,
      );
      return;
    }

    currentRuntime = nextRuntime;
    usage = createAgentRunnerUsage({ store, runtime: currentRuntime });
    currentRuntime.onReceiveMessage(notifyExternalEvent);
    options.onRuntimeReloaded?.(nextRuntime);
    await withTimeout(
      previousRuntime.dispose(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Previous agent runtime disposal timed out for ${runtime.id}`,
    );
  }

  function clearTimer() {
    scheduler.clearTimer();
  }

  function clearHealthcheck() {
    scheduler.clearHealthcheck();
  }

  function schedule(delayMs: number) {
    scheduler.scheduleNextStep(delayMs);
  }

  async function start() {
    if (stopped) {
      return;
    }

    scheduler.startHealthcheck();
    await refreshRunFlushSettings();

    const executionState = await withTimeout(
      store.getExecutionState(runtime.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state lookup timed out for ${runtime.id}`,
    );

    if (executionState === 'idle') {
      await currentRuntime.longTermMemory?.onAgentIdle();
      return;
    }

    if (executionState === 'absent') {
      await beginRun({
        reloadRuntime: false,
        wakeStartedAt: Date.now(),
        markRunning: true,
      });
      return;
    }

    await beginRun({
      reloadRuntime: false,
      wakeStartedAt: Date.now(),
      markRunning: false,
    });
  }

  async function execute(events: AgentWakeEvent[]) {
    if (stopped) {
      return;
    }

    const executionState = await withTimeout(
      store.getExecutionState(runtime.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state lookup timed out for ${runtime.id}`,
    );

    const idleOnlyEvents = events.filter((event) => event.idleOnly === true);
    const runnableEvents = events.filter((event) => event.idleOnly !== true);

    if (executionState !== 'idle' || startingRun) {
      appendPendingRunMessages(runnableEvents);

      for (const event of idleOnlyEvents) {
        wakeQueue.notifyExternalEvent(event);
      }

      return;
    }

    appendPendingRunMessages(runnableEvents);

    if (idleOnlyEvents.length > 0) {
      appendPendingRunMessages(idleOnlyEvents, {
        allowIdleOnly: true,
      });
    }

    await beginRun({
      reloadRuntime: false,
      wakeStartedAt: Date.now(),
      markRunning: true,
    });
  }

  function appendPendingRunMessages(
    events: AgentWakeEvent[],
    options: {
      allowIdleOnly?: boolean;
    } = {},
  ) {
    void messageManager.appendPendingRunMessages(events, options);
  }

  function flushPendingRunMessages(
    options: {
      allowOriginIdleOnly?: boolean;
    } = {},
  ) {
    return messageManager.flushPendingRunMessages(options);
  }

  function stop() {
    stopped = true;
    startingRun = false;
    startingRunStartedAt = null;
    activeRunId = null;
    scheduler.stop();
    executing = false;
    clearTimer();
    clearHealthcheck();
    wakeQueue.stop();
    messageManager.reset();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async function forceIdle(
    _options: {
      preserveQueuedWork?: boolean;
    } = {},
  ) {
    const _runEpoch = startNewRunEpoch();
    startingRun = false;
    startingRunStartedAt = null;
    executing = false;
    applyIdleState(_runEpoch);
    if (isStaleRun(_runEpoch)) {
      return;
    }

    lastWakeStartedAt = null;
    lastStepStartedAt = null;
    lastStepStage = null;
    scheduler.clearTimer();
  }

  async function beginRun(input: {
    reloadRuntime: boolean;
    wakeStartedAt: number;
    markRunning: boolean;
  }) {
    if (stopped || startingRun) {
      return;
    }

    startingRun = true;
    startingRunStartedAt = Date.now();
    const _runEpoch = startNewRunEpoch();

    try {
      activeRunId = createId();
      scheduler.setInstant(true);
      scheduler.resetBackoff();
      lastWakeStartedAt = input.wakeStartedAt;
      resetLoopDetector();
      messageManager.reset();
      pendingLongTermMemoryRecallSystemText = null;
      await refreshRunFlushSettings();
      await resetRunLastMessages();

      if (input.reloadRuntime) {
        await reloadRuntimeForNewRun(_runEpoch);
      }

      if (isStaleRun(_runEpoch)) {
        return;
      }

      currentRuntime.longTermMemory?.onAgentRunning();

      if (input.markRunning) {
        await withTimeout(
          store.setExecutionState(runtime.id, 'running'),
          RUNNER_AWAIT_TIMEOUT_MS,
          `Agent execution state update timed out for ${runtime.id}`,
        );
      }

      if (isStaleRun(_runEpoch)) {
        return;
      }

      await queueNextStep(_runEpoch);
    } catch (error) {
      forgeDebug({
        scope: 'agent-runner',
        level: 'error',
        runtimeId: runtime.id,
        message: 'failed to begin run',
        context: { error: errorMsg(error) },
      });
      if (!isStaleRun(_runEpoch)) {
        await transitionToIdle(_runEpoch);
      }
    } finally {
      startingRun = false;
      startingRunStartedAt = null;
    }
  }

  async function queueNextStep(_runEpoch: number) {
    if (stopped || executing || timer || isStaleRun(_runEpoch)) {
      return;
    }

    try {
      const executionState = await withTimeout(
        store.getExecutionState(runtime.id),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state lookup timed out for ${runtime.id}`,
      );

      if (executionState === 'idle' || isStaleRun(_runEpoch)) {
        return;
      }

      const nextAttempt = await planNextAttempt();

      if (isStaleRun(_runEpoch)) {
        return;
      }

      if (nextAttempt.execute === 'idle') {
        scheduler.setInstant(false);
        await transitionToIdle(_runEpoch);
        return;
      }

      if (!nextAttempt.execute) {
        scheduler.setInstant(false);
        scheduler.scheduleNextStep(nextAttempt.delayMs);
        return;
      }

      const delayMs = nextAttempt.delayMs;
      scheduler.setInstant(false);
      scheduler.scheduleNextStep(delayMs, () => executeStep(nextAttempt.contractId, _runEpoch));
    } catch (error) {
      forgeDebug({
        scope: 'agent-runner',
        level: 'error',
        runtimeId: runtime.id,
        message: 'failed to schedule next step',
        context: { error: errorMsg(error) },
      });
      scheduler.setInstant(false);
      schedule(nextExponentialBackoffMs(scheduler.getState().backoffMs).current);
    }
  }

  async function executeStep(contractId: string, _runEpoch: number) {
    if (stopped || executing || isStaleRun(_runEpoch)) {
      return;
    }

    executing = true;
    scheduler.advanceStepEpoch();
    let continueRunning = false;
    let drainWakeQueueAfterStep = false;
    let prompt = '';
    lastStepStartedAt = Date.now();
    lastStepStage = 'step-started';

    try {
      lastStepStage = 'checking-execution-state';
      const executionState = await withTimeout(
        store.getExecutionState(runtime.id),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state lookup timed out for ${runtime.id}`,
      );

      if (executionState === 'idle' || isStaleRun(_runEpoch)) {
        return;
      }

      if (executionState === 'absent') {
        await withTimeout(
          store.setExecutionState(runtime.id, 'running'),
          RUNNER_AWAIT_TIMEOUT_MS,
          `Agent execution state update timed out for ${runtime.id}`,
        );
      }

      lastStepStage = 'loading-runnable-contract';
      const contract = await withTimeout(
        store.getRunnableContract(runtime.id),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent runnable contract lookup timed out for ${runtime.id}`,
      );

      if (isStaleRun(_runEpoch)) {
        return;
      }

      if (!contract) {
        await transitionToIdle(_runEpoch, {
          deferWakeQueueDrain: true,
        });
        drainWakeQueueAfterStep = true;
        return;
      }

      if (contract.id !== contractId) {
        await queueNextStep(_runEpoch);
        return;
      }

      const stepLongTermMemoryRecallSystemText = pendingLongTermMemoryRecallSystemText;
      pendingLongTermMemoryRecallSystemText = null;
      lastStepStage = 'flushing-pending-run-messages';
      prompt =
        flushPendingRunMessages({
          allowOriginIdleOnly: true,
        }) ?? '';
      forgeDebug({
        scope: 'agent-runner',
        level: 'debug',
        runtimeId: runtime.id,
        message: 'executing step',
      });

      lastStepStage = 'agent-generate';
      const backoffState = { backoffMs: scheduler.getState().backoffMs, instant: scheduler.getState().instant, nextStepAt: scheduler.getState().nextStepAt };
      const result = await generateWithTimeoutRetries(
        prompt,
        _runEpoch,
        contractId,
        contract,
        stepLongTermMemoryRecallSystemText,
        {
          db,
          runtime,
          currentRuntime,
          store,
          usage: usage as unknown as AgentRunnerUsage,
          notifications,
          homeMetricSnapshots,
          messageManager,
          runLastMessages,
          flushPendingRunMessages,
          // The Scheduler type in GenerateDeps is a narrower interface than
          // what createScheduler returns. Cast through the declared
          // Scheduler type to silence the type mismatch on
          // planNextStepDelay (returns Promise<number> in the full impl,
          // Promise<void> in the GenerateDeps contract).
          scheduler: scheduler as unknown as Scheduler,
          epochState: {
            activeRunEpoch: 0,
            activeStepEpoch: 0,
            activeGenerateToken: 0,
            activeRunId: null,
          },
          backoffState,
          progressState: {
            lastStepStartedAt: null,
            lastStepStage: null,
            lastGenerateProgress: null,
          },
          loopState: { lastLoopSignature: null, repeatedLoopCount: 0 },
          loopDetector: loopManager,
          currentGenerateAbortController,
          setCurrentGenerateAbortController: (c) => {
            currentGenerateAbortController = c;
          },
          markGenerateProgress: () => {},
          setBackoffMs: (ms: number) => {
            backoffState.backoffMs = ms;
          },
          setInstant: (v: boolean) => {
            backoffState.instant = v;
          },
          setNextStepAt: (v: number | null) => {
            backoffState.nextStepAt = v;
          },
          setLoopSignature: (sig) => {
            loopManager.getState().lastLoopSignature = sig;
          },
          loopSignature: loopManager.getState().lastLoopSignature ?? '',
          activeRunId,
          loadAgentContextInstructions: loadAgentContextInstructions as (
            currentRuntime: InternalAgentRuntime,
            db: Database,
          ) => Promise<string | null>,
          isStopped: () => stopped,
        },
      );

      if (isStaleRun(_runEpoch)) {
        return;
      }
      lastStepStage = 'finalizing-run';
      if (!result) {
        throw new Error('Unexpected: generate result is undefined');
      }
      const controlDirective = extractRunnerControlDirective(result);
      const stopRequested = controlDirective === 'stop';

      if (stopRequested && messageManager.getPendingCount() === 0) {
        scheduler.clearTimer();
        resetLoopDetector();
        await transitionToIdle(_runEpoch, {
          deferWakeQueueDrain: true,
        });
        drainWakeQueueAfterStep = true;
        return;
      }

      scheduler.resetBackoff();
      continueRunning = messageManager.getPendingCount() > 0;
    } catch (error) {
      if (isStaleRun(_runEpoch)) {
        return;
      }

      forgeDebug({
        scope: 'agent-runner',
        level: 'error',
        runtimeId: runtime.id,
        message: 'step failed',
        context: {
          mastraId: currentRuntime.mastraId,
          pricingModelKey: currentRuntime.pricingModelKey,
          modelProfileId: currentRuntime.modelProfileId,
          stepStartedAt: lastStepStartedAt,
          stepStage: lastStepStage,
          lastGenerateProgress,
          prompt,
          error: errorMsg(error),
        },
      });
      await withTimeout(
        store.setExecutionAbsent(
          runtime.id,
          formatAbsentExecutionError({
            stage: lastStepStage,
            lastGenerateProgress,
            error,
          }),
        ),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state update timed out for ${runtime.id}`,
      ).catch((stateError) => {
        forgeDebug({
          scope: 'agent-runner',
          level: 'error',
          runtimeId: runtime.id,
          message: 'failed to set absent state',
          context: { stateError },
        });
      });
      schedule(nextExponentialBackoffMs(scheduler.getState().backoffMs).current);
    } finally {
      lastStepStartedAt = null;
      lastStepStage = null;
      lastGenerateProgress = null;
      if (scheduler.getActiveStepEpoch() === _runEpoch) {
        executing = false;
      }

      if (drainWakeQueueAfterStep && !isStaleRun(_runEpoch)) {
        await wakeQueue.onRunnerIdle();
      }

      if (continueRunning && !isStaleRun(_runEpoch)) {
        await queueNextStep(_runEpoch);
      }
    }
  }

  function applyIdleState(_runEpoch: number) {
    clearTimer();
    scheduler.setInstant(false);
    resetLoopDetector();
    void withTimeout(
      store.setExecutionState(runtime.id, 'idle'),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state update timed out for ${runtime.id}`,
    );
    void withTimeout(
      currentRuntime.longTermMemory?.onAgentIdle() ?? Promise.resolve(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent long-term memory idle transition timed out for ${runtime.id}`,
    );
  }

  function resetLoopDetector() {
    loopManager.reset();
  }

  async function resetRunLastMessages() {
    const settings = await withTimeout(
      systemSettings.getSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${runtime.id}`,
    );

    if (settings.memoryLastMessagesFullEnabled) {
      runLastMessages = FULL_MEMORY_LOAD_LAST_MESSAGES;
      return;
    }

    runLastMessages = settings.memoryLastMessagesCount || DEFAULT_RUN_LAST_MESSAGES;
  }

  async function refreshRunFlushSettings() {
    const settings = await withTimeout(
      systemSettings.getSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${runtime.id}`,
    );

    messageManager.updateFlushSettings(settings);
  }
  function _registerLoopSignature(signature: string) {
    return loopManager.register(signature);
  }

  async function planNextAttempt(): Promise<
    | {
        execute: 'idle';
      }
    | {
        execute: false;
        delayMs: number;
      }
    | {
        execute: true;
        contractId: string;
        delayMs: number;
      }
  > {
    const contract = await withTimeout(
      store.getRunnableContract(runtime.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent runnable contract lookup timed out for ${runtime.id}`,
    );

    if (!contract) {
      return {
        execute: 'idle' as const,
      };
    }

    const spentUsd = await withTimeout(
      store.getContractSpend(contract.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent contract spend lookup timed out for ${runtime.id}`,
    );
    const remainingBudgetUsd = contract.budgetUsd - spentUsd;
    const estimatedStepUsd = await withTimeout(
      usage.estimateStepCostUsd(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent step cost estimate timed out for ${runtime.id}`,
    );

    if (estimatedStepUsd !== null && remainingBudgetUsd < estimatedStepUsd) {
      return {
        execute: 'idle' as const,
      };
    }

    scheduler.resetBackoff();
    const settings = await withTimeout(
      systemSettings.getSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${runtime.id}`,
    );

    return {
      execute: true as const,
      contractId: contract.id,
      delayMs:
        scheduler.getState().instant || !settings.stepDelayEnabled
          ? 0
          : calculateBudgetDelayMs(contract.endsAt, remainingBudgetUsd, estimatedStepUsd),
    };
  }

  function getSnapshot() {
    return buildRunnerSnapshot(
      scheduler,
      messageManager,
      wakeQueue,
      { stopped, startingRun, startingRunStartedAt, executing, lastStepStartedAt, lastStepStage, lastWakeStartedAt, timer },
    );
  }

  return {
    start,
    stop,
    forceIdle,
    execute,
    getSnapshot,
    notifyExternalEvent,
  };

  /**
   * Extracts feedback messages and determines whether to continue the agent run
   * after an iteration completes. Extracted from generateWithTimeoutRetries
   * to reduce function length and improve readability.
   */

  function notifyExternalEvent(event: AgentWakeEvent) {
    if (stopped) {
      return;
    }

    wakeQueue.notifyExternalEvent(event);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (event.idleOnly && isLocallyIdle()) {
      void wakeQueue.onRunnerIdle();
    }
  }

  function startNewRunEpoch() {
    // Advance both local activeRunId and scheduler's epoch state
    activeRunId = createId();
    advanceGenerateToken(scheduler.getState());
    currentGenerateAbortController?.abort(new Error('Agent generate invalidated'));
    currentGenerateAbortController = null;
    return scheduler.startNewRunEpoch();
  }

  function isStaleRun(_runEpoch: number) {
    return stopped || _runEpoch !== scheduler.getActiveRunEpoch();
  }

  function isLocallyIdle() {
    return !startingRun && !executing && !timer;
  }

  async function transitionToIdle(
    _runEpoch: number,
    options: {
      deferWakeQueueDrain?: boolean;
    } = {},
  ) {
    if (isStaleRun(_runEpoch)) {
      return;
    }

    clearTimer();
    advanceGenerateToken(scheduler.getState());
    currentGenerateAbortController?.abort(new Error('Agent generate invalidated'));
    currentGenerateAbortController = null;
    applyIdleState(_runEpoch);

    if (isStaleRun(_runEpoch)) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (options.deferWakeQueueDrain) {
      return;
    }

    await wakeQueue.onRunnerIdle();
  }
}

export type InternalAgentRunner = ReturnType<typeof createAgentRunner>;
