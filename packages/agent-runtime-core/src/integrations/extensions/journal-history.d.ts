import type { RuntimePlugin } from '../../core/plugins.js';
import type { StepContentSegment } from '../../core/types.js';
import type { RuntimeJournal } from '../journal/contracts.js';
export type JournalHistoryPluginOptions = {
    name?: string;
    journal: RuntimeJournal;
    maxSteps?: number;
    includeKinds?: StepContentSegment['kind'][];
};
export declare function createJournalHistoryPlugin(options: JournalHistoryPluginOptions): RuntimePlugin;
