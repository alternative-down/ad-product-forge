const WAKE_DEBOUNCE_MS = 1000;
const WAKE_MAX_DELAY_MS = 10000;

export type AgentWakeQueue = {
  notifyExternalEvent(): void;
  getSnapshot(): {
    pending: boolean;
    firstPendingAt: number | null;
    nextTriggerAt: number | null;
  };
};

export function createAgentWakeQueue(config: { run(): Promise<unknown> }): AgentWakeQueue {
  let timer: NodeJS.Timeout | null = null;
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

  function trigger() {
    clearTimer();
    firstPendingAt = null;
    void config.run();
  }

  return {
    notifyExternalEvent() {
      clearTimer();

      const now = Date.now();

      firstPendingAt ??= now;

      if (now - firstPendingAt >= WAKE_MAX_DELAY_MS) {
        trigger();
        return;
      }

      nextTriggerAt = now + WAKE_DEBOUNCE_MS;
      timer = setTimeout(trigger, WAKE_DEBOUNCE_MS);
    },
    getSnapshot() {
      return {
        pending: timer !== null,
        firstPendingAt,
        nextTriggerAt,
      };
    },
  };
}
