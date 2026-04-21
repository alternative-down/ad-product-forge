import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeJournal } from '../journal/contracts.js';
export type RuntimeJournalPluginOptions = {
    name?: string;
    journal: RuntimeJournal;
};
export declare function createRuntimeJournalPlugin(options: RuntimeJournalPluginOptions): RuntimePlugin;
