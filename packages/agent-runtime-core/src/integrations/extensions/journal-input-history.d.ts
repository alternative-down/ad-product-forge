import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeJournal } from '../journal/contracts.js';
export type JournalInputHistoryPluginOptions = {
    name?: string;
    journal: RuntimeJournal;
    maxInputs?: number;
};
export declare function createJournalInputHistoryPlugin(options: JournalInputHistoryPluginOptions): RuntimePlugin;
