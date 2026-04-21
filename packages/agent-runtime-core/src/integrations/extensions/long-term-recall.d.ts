import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput, StepContextEntry, StepRecord } from '../../core/types.js';
import type { LongTermMemoryRecall } from '../memory/long-term-memory.js';
export type LongTermRecallPluginOptions = {
    memory: LongTermMemoryRecall;
    topK?: number;
    threshold?: number;
    dedupeWindow?: number;
    buildQuery(context: {
        pendingInputs: RuntimeInput[];
        steps: StepRecord[];
    }): string | null;
    renderResult?(input: {
        id: string;
        text: string;
        score: number;
    }, index: number): StepContextEntry;
};
export declare function createLongTermRecallPlugin(options: LongTermRecallPluginOptions): RuntimePlugin;
