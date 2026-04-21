import type { RuntimeInput } from './types.js';
export type InputBatch = {
    selected: RuntimeInput[];
    remaining: RuntimeInput[];
};
export type InputBatchingStrategy = {
    select(pendingInputs: RuntimeInput[]): InputBatch;
};
export declare function createConsumeAllInputBatchingStrategy(): InputBatchingStrategy;
export declare function createFixedSizeInputBatchingStrategy(size: number): InputBatchingStrategy;
