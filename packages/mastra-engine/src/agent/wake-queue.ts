const DEFAULT_WAKE_DEBOUNCE_MS = 3000;
const DEFAULT_WAKE_MAX_ACCUMULATION_MS = 10000;
const GROUP_MESSAGE_WAKE_DEBOUNCE_MS = 8000;
const GROUP_MESSAGE_WAKE_MAX_ACCUMULATION_MS = 20000;

export type AgentWakeEvent = {
  type: string;
  groupKey: string;
  idempotencyKey: string;
  timestamp: number;
  text: string;
  idleOnly?: boolean;
  originIdleOnly?: boolean;
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
  let waitingForIdle = false;
  let firstPendingAt: number | null = null;
  let nextTriggerAt: number | null = null;
  const readyEvents = new Map<string, AgentWakeEvent>();
  const idleEvents = new Map<string, AgentWakeEvent>();

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

    for (const event of readyEvents.values()) {
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

    const queuedEvents = Array.from(readyEvents.values()).sort((left, right) => left.timestamp - right.timestamp);

    pending = false;
    firstPendingAt = null;
    readyEvents.clear();

    try {
      await config.execute(queuedEvents);
    } catch (error) {
      for (const event of queuedEvents) {
        readyEvents.set(event.idempotencyKey, event);
      }

      pending = readyEvents.size > 0;
      firstPendingAt ??= Date.now();

      console.error(`[AgentWakeQueue] ${config.label ?? 'agent'} failed to execute:`, error);

      if (!pending) {
        return;
      }

      const wakeWindow = getCurrentWakeWindow();
      scheduleTrigger(wakeWindow.debounceMs);
    }
  }

  return {
    notifyExternalEvent(event: AgentWakeEvent) {
      const now = Date.now();
      const targetEvents = event.idleOnly ? idleEvents : readyEvents;

      if (readyEvents.has(event.idempotencyKey) || idleEvents.has(event.idempotencyKey)) {
        return;
      }

      targetEvents.set(event.idempotencyKey, event);

      if (event.idleOnly) {
        waitingForIdle = true;
        return;
      }

      pending = true;
      firstPendingAt ??= now;

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
      if (idleEvents.size > 0) {
        for (const event of idleEvents.values()) {
          readyEvents.set(event.idempotencyKey, event);
        }

        idleEvents.clear();
        waitingForIdle = false;
        pending = readyEvents.size > 0;
        firstPendingAt ??= Date.now();
      }

      if (!pending) {
        return;
      }

      const now = Date.now();
      const wakeWindow = getCurrentWakeWindow();
      const accumulatedMs = firstPendingAt ? now - firstPendingAt : 0;

      if (accumulatedMs >= wakeWindow.maxAccumulationMs) {
        clearTimer();
        void trigger();
        return;
      }

      const remainingAccumulationMs = wakeWindow.maxAccumulationMs - accumulatedMs;
      scheduleTrigger(Math.min(wakeWindow.debounceMs, remainingAccumulationMs));
    },
    stop() {
      pending = false;
      waitingForIdle = false;
      firstPendingAt = null;
      readyEvents.clear();
      idleEvents.clear();
      clearTimer();
    },
    getSnapshot() {
      return {
        pending,
        waitingForIdle,
        firstPendingAt,
        nextTriggerAt,
        events: [...readyEvents.values(), ...idleEvents.values()],
      };
    },
  };
}
