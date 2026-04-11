const DEFAULT_WAKE_DEBOUNCE_MS = 10000;
const DEFAULT_WAKE_MAX_ACCUMULATION_MS = 30000;
const GROUP_MESSAGE_WAKE_DEBOUNCE_MS = 120000;
const GROUP_MESSAGE_WAKE_MAX_ACCUMULATION_MS = 300000;

export type AgentWakeEvent = {
  type: string;
  groupKey: string;
  idempotencyKey: string;
  timestamp: number;
  text: string;
  groupMetadata?: Record<string, string>;
  itemMetadata?: Record<string, string>;
};

export type AgentWakeQueue = {
  notifyExternalEvent(event: AgentWakeEvent): void;
  onRunnerIdle(): Promise<void>;
  stop(): void;
  getSnapshot(): {
    pending: boolean;
    waitingForIdle: boolean;
    firstPendingAt: number | null;
    nextTriggerAt: number | null;
    events: AgentWakeEvent[];
  };
};

export function createAgentWakeQueue(config: {
  label?: string;
  execute(events: AgentWakeEvent[]): Promise<void>;
}): AgentWakeQueue {
  let timer: NodeJS.Timeout | null = null;
  let pending = false;
  let firstPendingAt: number | null = null;
  let nextTriggerAt: number | null = null;
  const events = new Map<string, AgentWakeEvent>();

  function isGroupMessageEvent(event: AgentWakeEvent) {
    return event.type.startsWith('message:') && event.groupMetadata?.ConversationType === 'group';
  }

  function getWakeWindow(event: AgentWakeEvent) {
    if (isGroupMessageEvent(event)) {
      return {
        debounceMs: GROUP_MESSAGE_WAKE_DEBOUNCE_MS,
        maxAccumulationMs: GROUP_MESSAGE_WAKE_MAX_ACCUMULATION_MS,
      };
    }

    return {
      debounceMs: DEFAULT_WAKE_DEBOUNCE_MS,
      maxAccumulationMs: DEFAULT_WAKE_MAX_ACCUMULATION_MS,
    };
  }

  function getCurrentWakeWindow() {
    let debounceMs = DEFAULT_WAKE_DEBOUNCE_MS;
    let maxAccumulationMs = DEFAULT_WAKE_MAX_ACCUMULATION_MS;

    for (const event of events.values()) {
      const candidate = getWakeWindow(event);
      debounceMs = Math.max(debounceMs, candidate.debounceMs);
      maxAccumulationMs = Math.max(maxAccumulationMs, candidate.maxAccumulationMs);
    }

    return { debounceMs, maxAccumulationMs };
  }

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

    const queuedEvents = Array.from(events.values()).sort((left, right) => left.timestamp - right.timestamp);

    pending = false;
    firstPendingAt = null;
    events.clear();

    try {
      await config.execute(queuedEvents);
    } catch (error) {
      console.error(`[AgentWakeQueue] ${config.label ?? 'agent'} failed to execute:`, error);
    }
  }

  return {
    notifyExternalEvent(event: AgentWakeEvent) {
      const now = Date.now();

      if (events.has(event.idempotencyKey)) {
        return;
      }

      pending = true;
      firstPendingAt ??= now;
      events.set(event.idempotencyKey, event);

      const wakeWindow = getCurrentWakeWindow();
      const accumulatedMs = now - firstPendingAt;
      if (accumulatedMs >= wakeWindow.maxAccumulationMs) {
        clearTimer();
        void trigger();
        return;
      }

      const remainingAccumulationMs = wakeWindow.maxAccumulationMs - accumulatedMs;
      scheduleTrigger(Math.min(wakeWindow.debounceMs, remainingAccumulationMs));
    },
    async onRunnerIdle() {
      if (!pending) {
        return;
      }

      clearTimer();
      await trigger();
    },
    stop() {
      pending = false;
      firstPendingAt = null;
      events.clear();
      clearTimer();
    },
    getSnapshot() {
      return {
        pending,
        waitingForIdle: false,
        firstPendingAt,
        nextTriggerAt,
        events: Array.from(events.values()),
      };
    },
  };
}
