import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput, StepContextEntry, StepRecord } from '../../core/types.js';
export type RecallDocument = {
    id: string;
    text: string;
    score?: number;
};
export type InMemoryRecallPluginOptions = {
    name?: string;
    maxItems?: number;
    dedupeWindow?: number;
    buildQuery(context: {
        pendingInputs: RuntimeInput[];
        steps: StepRecord[];
    }): string | null;
    retrieve(context: {
        query: string;
        pendingInputs: RuntimeInput[];
        steps: StepRecord[];
    }): Promise<RecallDocument[]> | RecallDocument[];
    renderDocument?(document: RecallDocument, index: number): StepContextEntry;
};
export declare function createInMemoryRecallPlugin(options: InMemoryRecallPluginOptions): RuntimePlugin;
