const WAKE_DEBOUNCE_MS = 5000;

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

  function scheduleTrigger() {
    clearTimer();
    nextTriggerAt = Date.now() + WAKE_DEBOUNCE_MS;
    timer = setTimeout(() => {
      timer = null;
      nextTriggerAt = null;
      void trigger();
    }, WAKE_DEBOUNCE_MS);
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
      pending = true;
      firstPendingAt ??= Date.now();
      scheduleTrigger();
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
