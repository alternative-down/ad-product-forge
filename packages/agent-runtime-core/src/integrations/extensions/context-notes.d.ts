import type { RuntimePlugin } from '../../core/plugins.js';
import type { ContextNoteStore } from '../state/context-note-store.js';
export type ContextNotesPluginOptions = {
    name?: string;
    store: ContextNoteStore;
    maxNotes?: number;
};
export declare function createContextNotesPlugin(options: ContextNotesPluginOptions): RuntimePlugin;
