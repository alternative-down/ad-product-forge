const WAKE_DEBOUNCE_MS = 5000;
const WAKE_MAX_DELAY_MS = 60000;

export type AgentWakeQueue = {
  notifyExternalEvent(): void;
  onRunnerIdle(): Promise<void>;
  stop(): void;
  getSnapshot(): {
    pending: boolean;
    waitingForIdle: boolean;
    firstPendingAt: number | null;
    nextTriggerAt: number | null;
  };
};

export function createAgentWakeQueue(config: {
  label?: string;
  isRunning(): Promise<boolean>;
  wake(): Promise<void>;
}): AgentWakeQueue {
  let timer: NodeJS.Timeout | null = null;
  let pending = false;
  let waitingForIdle = false;
  let firstPendingAt: number | null = null;
  let nextTriggerAt: number | null = null;

  function clearTimer() {
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    timer = null;
    nextTriggerAt = null;
  }

  function scheduleTrigger(delayMs: number) {
    clearTimer();
    nextTriggerAt = Date.now() + Math.max(delayMs, 0);
    timer = setTimeout(
      () => {
        void trigger();
      },
      Math.max(delayMs, 0),
    );
  }

  async function trigger() {
    clearTimer();

    if (!pending) {
      console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} trigger called but pending=false, skipping`);
      return;
    }

    const isAgentRunning = await config.isRunning();
    console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} trigger executing, isRunning=${isAgentRunning}, pending=${pending}, waitingForIdle=${waitingForIdle}`);

    try {
      if (isAgentRunning) {
        waitingForIdle = true;
        console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} is still running, keeping wake pending`);
        return;
      }

      pending = false;
      waitingForIdle = false;
      firstPendingAt = null;
      console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} waking now`);
      await config.wake();
    } catch (error) {
      console.error('[AgentWakeQueue] Failed to wake agent:', error);
      scheduleTrigger(WAKE_DEBOUNCE_MS);
    }
  }

  return {
    notifyExternalEvent() {
      pending = true;

      const now = Date.now();

      firstPendingAt ??= now;
      console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} received external event`);

      if (waitingForIdle) {
        return;
      }

      if (now - firstPendingAt >= WAKE_MAX_DELAY_MS) {
        void trigger();
        return;
      }

      scheduleTrigger(Math.min(WAKE_DEBOUNCE_MS, firstPendingAt + WAKE_MAX_DELAY_MS - now));
    },
    async onRunnerIdle() {
      console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} onRunnerIdle called, was waitingForIdle=${waitingForIdle}, pending=${pending}, timer=${!!timer}`);
      waitingForIdle = false; // ALWAYS reset when agent becomes idle

      if (timer || !pending) {
        console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} onRunnerIdle: no action (timer=${!!timer}, pending=${pending})`);
        return;
      }

      console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} became idle with pending wake`);
      await trigger();
    },
    stop() {
      pending = false;
      waitingForIdle = false;
      firstPendingAt = null;
      clearTimer();
    },
    getSnapshot() {
      return {
        pending,
        waitingForIdle,
        firstPendingAt,
        nextTriggerAt,
      };
    },
  };
}
