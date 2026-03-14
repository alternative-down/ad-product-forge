const WAKE_DEBOUNCE_MS = 1000;
const WAKE_MAX_DELAY_MS = 10000;

export type AgentWakeQueue = {
  notifyExternalEvent(): void;
};

export function createAgentWakeQueue(config: {
  run(): Promise<unknown>;
  onWakeStarted?: () => void;
  onWakeFinished?: () => void;
  onWakeError?: (error: unknown) => void;
}): AgentWakeQueue {
  let pending = false;
  let running = false;
  let firstPendingAt: number | null = null;
  let timer: NodeJS.Timeout | null = null;

  function clearTimer() {
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    timer = null;
  }

  async function runWake() {
    clearTimer();

    if (running || !pending) {
      return;
    }

    running = true;
    pending = false;
    firstPendingAt = null;
    config.onWakeStarted?.();

    try {
      await config.run();
      config.onWakeFinished?.();
    } catch (error) {
      config.onWakeError?.(error);
    } finally {
      running = false;

      if (!pending) {
        return;
      }

      timer = setTimeout(() => {
        void runWake();
      }, 0);
    }
  }

  return {
    notifyExternalEvent() {
      pending = true;

      if (running) {
        return;
      }

      const now = Date.now();
      firstPendingAt ??= now;

      const elapsed = now - firstPendingAt;
      const delay = Math.max(0, Math.min(WAKE_DEBOUNCE_MS, WAKE_MAX_DELAY_MS - elapsed));

      clearTimer();
      timer = setTimeout(() => {
        void runWake();
      }, delay);
    },
  };
}
