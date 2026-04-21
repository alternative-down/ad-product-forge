import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeJournal } from '../journal/contracts.js';

export type JournalInputHistoryPluginOptions = {
  name?: string;
  journal: RuntimeJournal;
  maxInputs?: number;
};

export function createJournalInputHistoryPlugin(
  options: JournalInputHistoryPluginOptions,
): RuntimePlugin {
  const maxInputs = options.maxInputs ?? 5;

  return {
    name: options.name ?? 'journal-input-history',
    async provideContext(context) {
      const snapshot = await options.journal.readSnapshot(context.runtimeId);
      const historicalInputs = snapshot.inputs
        .filter((input) => !context.pendingInputs.some((pendingInput) => pendingInput.id === input.id))
        .slice(-maxInputs);

      return historicalInputs.map((input) => ({
        id: `journal-input:${input.id}`,
        kind: 'journal-input-history',
        title: `Historical input ${input.type}`,
        text: JSON.stringify(input.payload, null, 2),
      }));
    },
  };
}
