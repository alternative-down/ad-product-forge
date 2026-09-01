import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeJournal } from '../journal/contracts.js';

export type RuntimeJournalPluginOptions = {
  name?: string;
  journal: RuntimeJournal;
};

export function createRuntimeJournalPlugin(options: RuntimeJournalPluginOptions): RuntimePlugin {
  return {
    name: options.name ?? 'runtime-journal',
    async onDispatch(context) {
      await options.journal.appendInput(context.runtimeId, context.input);
    },
    async onAfterStep(context) {
      await options.journal.appendStep(context.runtimeId, context.record);
    },
  };
}
