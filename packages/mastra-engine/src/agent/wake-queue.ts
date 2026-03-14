const WAKE_DEBOUNCE_MS = 1000;
const WAKE_MAX_DELAY_MS = 10000;

export type AgentWakeQueue = {
  notifyExternalEvent(): void;
};

export function createAgentWakeQueue(config: { run(): Promise<unknown> }): AgentWakeQueue {
  let timer: NodeJS.Timeout | null = null;
  let firstPendingAt: number | null = null;

  function clearTimer() {
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    timer = null;
  }

  function trigger() {
    clearTimer();
    firstPendingAt = null;
    void config.run();
  }

  return {
    notifyExternalEvent() {
      const now = Date.now();

      firstPendingAt ??= now;

      if (now - firstPendingAt >= WAKE_MAX_DELAY_MS) {
        trigger();
        return;
      }

      clearTimer();
      timer = setTimeout(trigger, WAKE_DEBOUNCE_MS);
    },
  };
}
