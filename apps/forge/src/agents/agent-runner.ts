import { buildRunnerSnapshot } from './agent-runner-snapshot';
import { createId } from '../utils/id';
import { createAgentWakeQueue } from '@forge-runtime/core';
import { agentRunnerDebug } from './agent-runner-debug';
import type { AgentWakeEvent } from '@forge-runtime/core';

import type { InternalAgentRuntime } from './runtime/types';
import { createAgentContractStore } from './agent-contract-store';

import type { Database } from '../database/client';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentNotificationStore } from '../notifications/store';
import { createAgentRunnerUsage } from './agent-runner-usage';
import { createAgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';
import { formatPendingRunEvents } from './agent-runner-wake';
import { createLoopManager } from './agent-runner-loop-manager';
import { createRunnerMessageManager } from './agent-runner-message-manager';

import { errorMsg } from './error-formatting';

import { rt } from './runtime-ops';

import {
  advanceGenerateToken,
  createRunnerLifecycleState,
  type RunnerLifecycleState,
} from './agent-runner-state';
import { loadAgentContextInstructions } from './agent-runner-context-loaders';
import { calculateBudgetDelayMs, nextExponentialBackoffMs } from './agent-runner-delay';
import { generateWithTimeoutRetries } from './agent-runner-generate';
import { touchGenerateTimeout } from './agent-runner-generate-timeout';

import { createScheduler, type SchedulerState } from './agent-runner-scheduler';
import { executeStep as executeStepExtracted, type ExecuteStepDeps } from './agent-runner-execute';
import { runHealthcheck } from './agent-runner-healthcheck';

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
    onHealthcheck: performHealthcheck,
  });
  const lifecycleState: RunnerLifecycleState = createRunnerLifecycleState();
  const loopManager = createLoopManager({ lastLoopSignature: null, repeatedLoopCount: 0 });
  const messageManager = createRunnerMessageManager(
    {
      flushedRunEventKeys: new Set<string>(),
      flushedRunEventKeyOrder: [] as string[],
      currentFlushSettings: {
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: true,
      },
      pendingRunMessages: new Map<string, AgentWakeEvent>(),
      inFlightRunMessages: new Map<string, AgentWakeEvent>(),
    },
    formatPendingRunEvents,
  );

  currentRuntime.onReceiveMessage(notifyExternalEvent);

  async function reloadRuntimeForNewRun(_runEpoch: number) {
    if (!options.reloadRuntime) {
      return;
    }

    const previousRuntime = currentRuntime;
    const nextRuntime = await rt(
      options.reloadRuntime(),
      `Agent runtime reload timed out for ${runtime.id}`,
    );

    if (isStaleRun(_runEpoch)) {
      await rt(nextRuntime.dispose(), `Agent runtime disposal timed out for ${runtime.id}`);
      return;
    }

    currentRuntime = nextRuntime;
    usage = createAgentRunnerUsage({ store, runtime: currentRuntime });
    currentRuntime.onReceiveMessage(notifyExternalEvent);
    options.onRuntimeReloaded?.(nextRuntime);
    agentRunnerDebug('info', 'disposing previous runtime after reload', {
      runtimeId: runtime.id,
    });
    await rt(
      previousRuntime.dispose(),
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
    if (lifecycleState.stopped) {
      return;
    }

    scheduler.startHealthcheck();
    await refreshRunFlushSettings();

    const executionState = await rt(
      store.getExecutionState(runtime.id),
      `Agent execution state lookup timed out for ${runtime.id}`,
    );

    if (executionState === 'idle') {
      return;
    }

    agentRunnerDebug('warn', 'recovering persisted execution state as idle', {
      runtimeId: runtime.id,
      executionState,
    });
    await rt(
      store.setExecutionState(runtime.id, 'idle'),
      `Agent startup execution state recovery timed out for ${runtime.id}`,
    );
  }

  async function performHealthcheck() {
    try {
      const executionState = await store.getExecutionState(runtime.id);
      agentRunnerDebug('debug', 'runner healthcheck started', {
        runtimeId: runtime.id,
        pendingMessageCount: messageManager.getPendingCount(),
        executionState,
        runner: getSnapshot(),
      });

      await runHealthcheck({
        runtimeId: runtime.id,
        getExecutionState: () => Promise.resolve(executionState),
        isLocallyIdle,
        getPendingCount: () => messageManager.getPendingCount(),
        getWakeSnapshot: () => wakeQueue.getSnapshot(),
        onRunnerIdle: () => wakeQueue.onRunnerIdle(),
        beginRun,
        queueNextStep: () => queueNextStep(scheduler.getActiveRunEpoch()),
        onStartingRunTimeout: () => undefined,
        syncStarterState: () => undefined,
        syncExecuting: () => undefined,
        syncTimer: () => undefined,
        isStaleRun,
        notifyError: (error) => {
          agentRunnerDebug('error', 'runner healthcheck step failed', {
            runtimeId: runtime.id,
            error: errorMsg(error),
          });
        },
      });
    } catch (error) {
      agentRunnerDebug('error', 'runner healthcheck failed', {
        runtimeId: runtime.id,
        error: errorMsg(error),
      });
    }
  }

  async function execute(events: AgentWakeEvent[]) {
    if (lifecycleState.stopped) {
      return;
    }

    const executionState = await rt(
      store.getExecutionState(runtime.id),
      `Agent execution state lookup timed out for ${runtime.id}`,
    );

    const idleOnlyEvents = events.filter((event) => event.idleOnly === true);
    const runnableEvents = events.filter((event) => event.idleOnly !== true);

    if (executionState !== 'idle' || lifecycleState.startingRun) {
      appendPendingRunMessages(runnableEvents);

      if (runnableEvents.length > 0) {
        scheduler.setInstant(true);
      }

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

    agentRunnerDebug('info', 'wake events queued for new run', {
      runtimeId: runtime.id,
      eventCount: events.length,
      runnableEventCount: runnableEvents.length,
      idleOnlyEventCount: idleOnlyEvents.length,
      pendingMessageCount: messageManager.getPendingCount(),
    });

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

  function stop() {
    lifecycleState.stopped = true;
    lifecycleState.startingRun = false;
    lifecycleState.startingRunStartedAt = null;
    lifecycleState.activeRunId = null;
    scheduler.stop();
    lifecycleState.executing = false;
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
    lifecycleState.startingRun = false;
    lifecycleState.startingRunStartedAt = null;
    lifecycleState.executing = false;
    applyIdleState(_runEpoch);
    if (isStaleRun(_runEpoch)) {
      return;
    }

    lifecycleState.lastWakeStartedAt = null;
    lifecycleState.lastStepStartedAt = null;
    lifecycleState.lastStepStage = null;
    scheduler.clearTimer();
  }

  async function beginRun(input: {
    reloadRuntime: boolean;
    wakeStartedAt: number;
    markRunning: boolean;
  }) {
    if (lifecycleState.stopped || lifecycleState.startingRun) {
      return;
    }

    lifecycleState.startingRun = true;
    lifecycleState.startingRunStartedAt = Date.now();
    const _runEpoch = startNewRunEpoch();

    try {
      lifecycleState.activeRunId = createId();
      scheduler.setInstant(true);
      scheduler.resetBackoff();
      lifecycleState.lastWakeStartedAt = input.wakeStartedAt;
      resetLoopDetector();
      messageManager.prepareForNewRun();
      agentRunnerDebug('info', 'new run preserved queued wake events', {
        runtimeId: runtime.id,
        pendingMessageCount: messageManager.getPendingCount(),
      });
      lifecycleState.pendingLongTermMemoryRecallSystemText = null;
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
        await rt(
          store.setExecutionState(runtime.id, 'running'),
          `Agent execution state update timed out for ${runtime.id}`,
        );
      }

      if (isStaleRun(_runEpoch)) {
        return;
      }

      await queueNextStep(_runEpoch);
    } catch (error) {
      agentRunnerDebug('error', 'failed to begin run', {
        runtimeId: runtime.id,
        error: errorMsg(error),
      });
      if (!isStaleRun(_runEpoch)) {
        await transitionToIdle(_runEpoch);
      }
    } finally {
      lifecycleState.startingRun = false;
      lifecycleState.startingRunStartedAt = null;
    }
  }

  async function queueNextStep(_runEpoch: number) {
    if (lifecycleState.stopped || lifecycleState.executing || isStaleRun(_runEpoch)) {
      return;
    }

    try {
      const executionState = await rt(
        store.getExecutionState(runtime.id),
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
      agentRunnerDebug('error', 'failed to schedule next step', {
        runtimeId: runtime.id,
        error: errorMsg(error),
      });
      scheduler.setInstant(false);
      schedule(nextExponentialBackoffMs(scheduler.getState().backoffMs).current);
    }
  }

  async function executeStep(contractId: string, _runEpoch: number) {
    // Wire-up: delegate to the extracted, fully-tested version (agent-runner-execute.ts).
    // The extracted version was created in PR #2321 but never wired up. This closes #5453.
    // Behavior changes (intentional improvements, not regressions):
    //   - Lock is acquired AFTER the execution-state check (not before) so that
    //     'idle' early-exits don't leave a stale lock in place.
    //   - progressState is reset on the 'idle' early-exit path
    //     (closure did not reset, leaving dangling timestamps).
    //   - lifecycleState.activeRunId flows through deps.epochState.lifecycleState.activeRunId (closure used a
    //     closure-captured let; extracted uses a shared epochState object).
    //   - All 20 tests in agent-runner-execute.test.ts now run against the
    //     production code path (previously they tested dead code).
    await executeStepExtracted(buildExecuteStepDeps(contractId, _runEpoch));
  }

  function buildExecuteStepDeps(contractId: string, runEpoch: number): ExecuteStepDeps {
    return {
      // Identity
      contractId,
      runEpoch,
      runtimeId: runtime.id,
      mastraId: currentRuntime.mastraId ?? '',
      pricingModelKey: currentRuntime.pricingModelKey ?? '',
      modelProfileId: currentRuntime.modelProfileId ?? '',
      // Runner state guards
      isStopped: () => lifecycleState.stopped,
      executingRef: {
        get value() {
          return lifecycleState.executing;
        },
        set value(v: boolean) {
          lifecycleState.executing = v;
        },
      },
      isStaleRun,
      // State containers
      epochState: {
        get activeRunEpoch() {
          return schedulerState.activeRunEpoch;
        },
        set activeRunEpoch(value) {
          schedulerState.activeRunEpoch = value;
        },
        get activeStepEpoch() {
          return schedulerState.activeStepEpoch;
        },
        set activeStepEpoch(value) {
          schedulerState.activeStepEpoch = value;
        },
        get activeGenerateToken() {
          return schedulerState.activeGenerateToken;
        },
        set activeGenerateToken(value) {
          schedulerState.activeGenerateToken = value;
        },
        get activeRunId() {
          return lifecycleState.activeRunId;
        },
        set activeRunId(value) {
          lifecycleState.activeRunId = value;
        },
      },
      backoffState: schedulerState,
      progressState: {
        get lastStepStartedAt() {
          return lifecycleState.lastStepStartedAt;
        },
        set lastStepStartedAt(value) {
          lifecycleState.lastStepStartedAt = value;
        },
        get lastStepStage() {
          return lifecycleState.lastStepStage;
        },
        set lastStepStage(value) {
          lifecycleState.lastStepStage = value;
        },
        get lastGenerateProgress() {
          return lifecycleState.lastGenerateProgress;
        },
        set lastGenerateProgress(value) {
          lifecycleState.lastGenerateProgress = value;
        },
      },
      loopState: loopManager.getState(),
      // Stores & managers
      store,
      messageManager,
      // Scheduler (planNextStepDelay returns Promise<number> per interface L33
      // matching createScheduler's full impl since D22 fix; no cast needed)
      scheduler,
      loopDetector: loopManager,
      // Wake-queue boundary
      onRunnerIdle: () => wakeQueue.onRunnerIdle(),
      // Core runner actions
      transitionToIdle,
      queueNextStep,
      generateWithTimeoutRetries,
      markGenerateProgress: (timeout, controller, info) => {
        lifecycleState.lastGenerateProgress = {
          stage: info.stage,
          at: Date.now(),
          detail: info.detail,
        };
        touchGenerateTimeout(
          timeout,
          controller,
          lifecycleState.lastStepStage,
          lifecycleState.lastGenerateProgress,
        );
      },
      setLoopSignature: (sig) => {
        loopManager.getState().lastLoopSignature = sig;
      },
      loopSignature: loopManager.getState().lastLoopSignature ?? '',
      loadAgentContextInstructions,
      currentRuntime,
      db,
      // Pending messages / LTM
      pendingLongTermMemoryRecallSystemText: lifecycleState.pendingLongTermMemoryRecallSystemText,
      flushPendingRunMessages: (opts) => messageManager.flushPendingRunMessages(opts),
      // Additional runner state
      usage,
      notifications,
      homeMetricSnapshots,
      workspaceBasePath: options.workspaceBasePath,
      getRunnerSnapshot: getSnapshot,
      runLastMessages: lifecycleState.runLastMessages,
      currentGenerateAbortController: lifecycleState.currentGenerateAbortController,
      setCurrentGenerateAbortController: (c) => {
        lifecycleState.currentGenerateAbortController = c;
      },
      // Error logging
      runtime,
    };
  }

  function applyIdleState(_runEpoch: number) {
    clearTimer();
    scheduler.setInstant(false);
    resetLoopDetector();
    void rt(
      store.setExecutionState(runtime.id, 'idle'),
      `Agent execution state update timed out for ${runtime.id}`,
    );
    void rt(
      currentRuntime.longTermMemory?.onAgentIdle() ?? Promise.resolve(),
      `Agent long-term memory idle transition timed out for ${runtime.id}`,
    );
  }

  function resetLoopDetector() {
    loopManager.reset();
  }

  async function resetRunLastMessages() {
    const settings = await rt(
      systemSettings.getSettings(),
      `System settings lookup timed out for ${runtime.id}`,
    );

    if (settings.memoryLastMessagesFullEnabled) {
      lifecycleState.runLastMessages = FULL_MEMORY_LOAD_LAST_MESSAGES;
      return;
    }

    lifecycleState.runLastMessages = settings.memoryLastMessagesCount || DEFAULT_RUN_LAST_MESSAGES;
  }

  async function refreshRunFlushSettings() {
    const settings = await rt(
      systemSettings.getSettings(),
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
    const contract = await rt(
      store.getRunnableContract(runtime.id),
      `Agent runnable contract lookup timed out for ${runtime.id}`,
    );

    if (!contract) {
      return {
        execute: 'idle' as const,
      };
    }

    const spentUsd = await rt(
      store.getContractSpend(contract.id),
      `Agent contract spend lookup timed out for ${runtime.id}`,
    );
    const remainingBudgetUsd = contract.budgetUsd - spentUsd;
    const estimatedStepUsd = await rt(
      usage.estimateStepCostUsd(),
      `Agent step cost estimate timed out for ${runtime.id}`,
    );

    if (estimatedStepUsd !== null && remainingBudgetUsd < estimatedStepUsd) {
      return {
        execute: 'idle' as const,
      };
    }

    scheduler.resetBackoff();
    const settings = await rt(
      systemSettings.getSettings(),
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
    return buildRunnerSnapshot(scheduler, messageManager, wakeQueue, {
      stopped: lifecycleState.stopped,
      startingRun: lifecycleState.startingRun,
      startingRunStartedAt: lifecycleState.startingRunStartedAt,
      executing: lifecycleState.executing,
      lastStepStartedAt: lifecycleState.lastStepStartedAt,
      lastStepStage: lifecycleState.lastStepStage,
      lastWakeStartedAt: lifecycleState.lastWakeStartedAt,
    });
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
    if (lifecycleState.stopped) {
      return;
    }

    wakeQueue.notifyExternalEvent(event);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (event.idleOnly && isLocallyIdle()) {
      void wakeQueue.onRunnerIdle();
    }
  }

  function startNewRunEpoch() {
    // Advance both local lifecycleState.activeRunId and scheduler's epoch state
    lifecycleState.activeRunId = createId();
    advanceGenerateToken(scheduler.getState());
    lifecycleState.currentGenerateAbortController?.abort(new Error('Agent generate invalidated'));
    lifecycleState.currentGenerateAbortController = null;
    return scheduler.startNewRunEpoch();
  }

  function isStaleRun(_runEpoch: number) {
    return lifecycleState.stopped || _runEpoch !== scheduler.getActiveRunEpoch();
  }

  function isLocallyIdle() {
    return !lifecycleState.startingRun && !lifecycleState.executing;
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
    lifecycleState.currentGenerateAbortController?.abort(new Error('Agent generate invalidated'));
    lifecycleState.currentGenerateAbortController = null;
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
