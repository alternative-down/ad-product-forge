import type { Agent } from '@mastra/core/agent';

const WAKE_DEBOUNCE_MS = 1000;
const WAKE_MAX_DELAY_MS = 10000;
const DEFAULT_WAKE_PROMPT = [
  'Pending external activity detected.',
  'Check your messages, inspect what is pending, and process what matters.',
].join('\n\n');

type WakeState = {
  pending: boolean;
  running: boolean;
  firstPendingAt: number | null;
  timer: NodeJS.Timeout | null;
};

const wakeStates = new Map<string, WakeState>();

function getWakeState(agentId: string): WakeState {
  let state = wakeStates.get(agentId);
  if (!state) {
    state = {
      pending: false,
      running: false,
      firstPendingAt: null,
      timer: null,
    };
    wakeStates.set(agentId, state);
  }
  return state;
}

function clearWakeTimer(state: WakeState) {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

export function getAgentWakeQueue(config: {
  agentId: string;
  agent: Agent;
  wakePrompt?: string;
  onWakeStarted?: () => void;
  onWakeFinished?: () => void;
  onWakeError?: (error: unknown) => void;
}) {
  const state = getWakeState(config.agentId);
  const wakePrompt = config.wakePrompt ?? DEFAULT_WAKE_PROMPT;

  const runWake = async () => {
    clearWakeTimer(state);
    if (state.running || !state.pending) {
      return;
    }

    state.running = true;
    state.pending = false;
    state.firstPendingAt = null;
    config.onWakeStarted?.();

    try {
      await config.agent.generate(wakePrompt);
      config.onWakeFinished?.();
    } catch (error) {
      config.onWakeError?.(error);
    } finally {
      state.running = false;

      if (state.pending) {
        state.timer = setTimeout(() => {
          void runWake();
        }, 0);
      }
    }
  };

  const scheduleWake = () => {
    if (state.running) {
      return;
    }

    const now = Date.now();
    state.firstPendingAt ??= now;
    const elapsed = now - state.firstPendingAt;
    const delay = Math.max(0, Math.min(WAKE_DEBOUNCE_MS, WAKE_MAX_DELAY_MS - elapsed));

    clearWakeTimer(state);
    state.timer = setTimeout(() => {
      void runWake();
    }, delay);
  };

  return {
    notifyExternalEvent() {
      state.pending = true;
      scheduleWake();
    },
  };
}
