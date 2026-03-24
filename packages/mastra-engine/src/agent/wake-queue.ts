const WAKE_DEBOUNCE_MS = 5000;
const WAKE_MAX_ACCUMULATION_MS = 30000;

export type AgentWakeEvent = {
  type: string;
  id: string;
  content: string;
  timestamp: number;
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
  execute(content: string): Promise<void>;
}): AgentWakeQueue {
  let timer: NodeJS.Timeout | null = null;
  let pending = false;
  let firstPendingAt: number | null = null;
  let nextTriggerAt: number | null = null;
  const events = new Map<string, AgentWakeEvent>();

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

    const content = formatWakeEvents(Array.from(events.values()));

    pending = false;
    firstPendingAt = null;
    events.clear();

    try {
      await config.execute(content);
    } catch (error) {
      console.error(`[AgentWakeQueue] ${config.label ?? 'agent'} failed to execute:`, error);
    }
  }

  return {
    notifyExternalEvent(event: AgentWakeEvent) {
      const now = Date.now();

      if (events.has(event.id)) {
        return;
      }

      pending = true;
      firstPendingAt ??= now;
      events.set(event.id, event);

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
      console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} onRunnerIdle called, was waitingForIdle=${waitingForIdle}, pending=${pending}, timer=${!!timer}`);

      // Don't reset waitingForIdle if a timer is pending — that timer will fire
      // and call trigger() which will wake the agent. Resetting here would
      // cause the second scheduled trigger to never wake the agent.
      if (!timer) {
        waitingForIdle = false;
      }

      if (timer || !pending) {
        console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} onRunnerIdle: no action (timer=${!!timer}, pending=${pending})`);
        return;
      }

      console.log(`[AgentWakeQueue] ${config.label ?? 'agent'} became idle with pending wake`);
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

function formatWakeEvents(events: AgentWakeEvent[]) {
  return events
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((event) =>
      [
        `Type: ${event.type}`,
        `Id: ${event.id}`,
        `At: ${new Date(event.timestamp).toISOString()}`,
        `Content:`,
        event.content.trim(),
      ].join('\n'),
    )
    .join('\n\n---\n\n');
}
