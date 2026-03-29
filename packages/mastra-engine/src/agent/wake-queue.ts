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

interface ParsedWakeEvent {
  type: string;
  id: string;
  timestamp: number;
  content: string;
  /** Extracted from content after "Type: message:{provider}" */
  provider?: string;
  /** Extracted from content after "Conversation key:" */
  conversationKey?: string;
}

function extractEventMetadata(event: AgentWakeEvent): ParsedWakeEvent {
  const typeMatch = event.content.match(/^Type: (message:(\w+))/);
  const convKeyMatch = event.content.match(/^Conversation key: (.+)$/m);

  return {
    type: event.type,
    id: event.id,
    timestamp: event.timestamp,
    content: event.content,
    provider: typeMatch ? typeMatch[2] : undefined,
    conversationKey: convKeyMatch ? convKeyMatch[1] : undefined,
  };
}

function formatWakeEvents(events: AgentWakeEvent[]) {
  const parsed = events.map(extractEventMetadata).sort((left, right) => left.timestamp - right.timestamp);

  // Group by provider + conversation key
  const groups = new Map<string, ParsedWakeEvent[]>();
  for (const event of parsed) {
    const groupKey = `${event.provider ?? event.type}|${event.conversationKey ?? event.id}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(groupKey, [event]);
    }
  }

  const formattedGroups: string[] = [];
  for (const [, groupEvents] of groups) {
    if (groupEvents.length === 0) continue;

    // Shared metadata from first event
    const first = groupEvents[0];
    const headerLines = [
      `Type: ${first.type}`,
      `At: ${new Date(first.timestamp).toISOString()}`,
    ];

    if (first.provider) {
      headerLines.push(`Provider: ${first.provider}`);
    }
    if (first.conversationKey) {
      headerLines.push(`Conversation: ${first.conversationKey}`);
    }

    // Messages sorted within group
    const messageLines = groupEvents.map((e) => {
      // Remove the standard header from content (everything before "Content:" or "Inbound")
      const contentMatch = e.content.match(/(?:Content:|Inbound communication received\.)/);
      if (contentMatch) {
        return e.content.slice(e.content.indexOf(contentMatch[0]) + contentMatch[0].length).trim();
      }
      return e.content.trim();
    });

    formattedGroups.push([...headerLines, '', 'Messages:', ...messageLines.map((m, i) => `[${i + 1}] ${m}`)].join('\n'));
  }

  return formattedGroups.join('\n\n---\n\n');
}
