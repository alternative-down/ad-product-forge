import type { RuntimePlugin } from '../../core/plugins.js';
import type { ContextNoteStore } from '../state/context-note-store.js';

export type ContextNotesPluginOptions = {
  name?: string;
  store: ContextNoteStore;
  maxNotes?: number;
};

export function createContextNotesPlugin(
  options: ContextNotesPluginOptions,
): RuntimePlugin {
  const maxNotes = options.maxNotes ?? Number.MAX_SAFE_INTEGER;

  return {
    name: options.name ?? 'context-notes',
    async provideContext(context) {
      const notes = await options.store.list(context.runtimeId);
      return notes.slice(0, maxNotes);
    },
  };
}
