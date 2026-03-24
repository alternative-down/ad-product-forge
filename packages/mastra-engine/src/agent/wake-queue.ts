const WAKE_DEBOUNCE_MS = 5000;
const WAKE_MAX_ACCUMULATION_MS = 30000;

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
  wake(): Promise<void>;
}): AgentWakeQueue {
  let timer: NodeJS.Timeout | null = null;
  let pending = false;
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
    nextTriggerAt = Date.now() + delayMs;
    timer = setTimeout(() => {
      timer = null;
      nextTriggerAt = null;
      void trigger();
    }, delayMs);
  }

  async function trigger() {
    if (!pending) {
      return;
    }

    pending = false;
    firstPendingAt = null;

    try {
      await config.wake();
    } catch (error) {
      console.error(`[AgentWakeQueue] ${config.label ?? 'agent'} failed to wake:`, error);
    }
  }

  return {
    notifyExternalEvent() {
      const now = Date.now();

      pending = true;
      firstPendingAt ??= now;

      const accumulatedMs = now - firstPendingAt;
      if (accumulatedMs >= WAKE_MAX_ACCUMULATION_MS) {
        clearTimer();
        void trigger();
        return;
      }

      const remainingAccumulationMs = WAKE_MAX_ACCUMULATION_MS - accumulatedMs;
      scheduleTrigger(Math.min(WAKE_DEBOUNCE_MS, remainingAccumulationMs));
    },
    async onRunnerIdle() {
    },
    stop() {
      pending = false;
      firstPendingAt = null;
      clearTimer();
    },
    getSnapshot() {
      return {
        pending,
        waitingForIdle: false,
        firstPendingAt,
        nextTriggerAt,
      };
    },
  };
}
