import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput } from '../../core/types.js';

export type RecentInputsPluginOptions = {
  name?: string;
  maxInputs?: number;
};

type RecentInputsState = {
  inputs: RuntimeInput[];
};

export function createRecentInputsPlugin(options: RecentInputsPluginOptions = {}): RuntimePlugin {
  const maxInputs = options.maxInputs ?? 5;
  const stateByRuntime = new Map<string, RecentInputsState>();

  function getOrCreateState(runtimeId: string) {
    const existing = stateByRuntime.get(runtimeId);

    if (existing) {
      return existing;
    }

    const created: RecentInputsState = {
      inputs: [],
    };

    stateByRuntime.set(runtimeId, created);
    return created;
  }

  return {
    name: options.name ?? 'recent-inputs',
    onDispatch(context) {
      const state = getOrCreateState(context.runtimeId);
      state.inputs.push(context.input);

      while (state.inputs.length > maxInputs) {
        state.inputs.shift();
      }
    },
    provideContext(context) {
      const state = getOrCreateState(context.runtimeId);
      const historicalInputs = state.inputs.filter(
        (input) => !context.pendingInputs.some((pendingInput) => pendingInput.id === input.id),
      );

      return historicalInputs.map((input) => ({
        id: `recent-input:${input.id}`,
        kind: 'recent-input',
        title: `Recent input ${input.type}`,
        text: JSON.stringify(input.payload, null, 2),
      }));
    },
  };
}
