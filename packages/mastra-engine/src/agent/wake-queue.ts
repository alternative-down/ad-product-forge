import type { Agent } from '@mastra/core/agent';

const WAKE_DEBOUNCE_MS = 1000;
const WAKE_MAX_DELAY_MS = 10000;
const DEFAULT_WAKE_PROMPT = [
  'Pending external activity detected.',
  'Check your messages, inspect what is pending, and process what matters.',
].join('\n\n');

export type AgentWakeQueue = {
  notifyExternalEvent(): void;
};

type WakeState = {
  pending: boolean;
  running: boolean;
  firstPendingAt: number | null;
  timer: NodeJS.Timeout | null;
};

type WakeQueueConfig = {
  agent: Agent;
  agentId: string;
  onWakeStarted?: () => void;
  onWakeFinished?: () => void;
  onWakeError?: (error: unknown) => void;
};

export function createWakeQueueRegistry() {
  const queues = new Map<string, AgentWakeQueue>();

  return {
    get(config: WakeQueueConfig) {
      const existing = queues.get(config.agentId);
      if (existing) {
        return existing;
      }

      const state: WakeState = {
        pending: false,
        running: false,
        firstPendingAt: null,
        timer: null,
      };

      const clearTimer = () => {
        if (!state.timer) {
          return;
        }

        clearTimeout(state.timer);
        state.timer = null;
      };

      const runWake = async () => {
        clearTimer();
        if (state.running || !state.pending) {
          return;
        }

        state.running = true;
        state.pending = false;
        state.firstPendingAt = null;
        config.onWakeStarted?.();

        try {
          await config.agent.generate(DEFAULT_WAKE_PROMPT, {
            memory: {
              thread: config.agentId,
              resource: config.agentId,
            },
            maxSteps: 1000,
          });
          config.onWakeFinished?.();
        } catch (error) {
          config.onWakeError?.(error);
        } finally {
          state.running = false;

          if (!state.pending) {
            return;
          }

          state.timer = setTimeout(() => {
            void runWake();
          }, 0);
        }
      };

      const queue: AgentWakeQueue = {
        notifyExternalEvent() {
          state.pending = true;

          if (state.running) {
            return;
          }

          const now = Date.now();
          state.firstPendingAt ??= now;

          const elapsed = now - state.firstPendingAt;
          const delay = Math.max(0, Math.min(WAKE_DEBOUNCE_MS, WAKE_MAX_DELAY_MS - elapsed));

          clearTimer();
          state.timer = setTimeout(() => {
            void runWake();
          }, delay);
        },
      };

      queues.set(config.agentId, queue);
      return queue;
    },
  };
}
