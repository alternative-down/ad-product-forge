import type { RuntimePlugin } from '../../core/plugins.js';
import type { StepContextEntry } from '../../core/types.js';

export type StaticContextPluginOptions = {
  name?: string;
  entries: StepContextEntry[] | (() => StepContextEntry[] | Promise<StepContextEntry[]>);
};

export function createStaticContextPlugin(options: StaticContextPluginOptions): RuntimePlugin {
  return {
    name: options.name ?? 'static-context',
    async provideContext() {
      if (typeof options.entries === 'function') {
        return options.entries();
      }

      return options.entries;
    },
  };
}
