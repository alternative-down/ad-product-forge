import type { RuntimeInput } from './types.js';

export type InputBatch = {
  selected: RuntimeInput[];
  remaining: RuntimeInput[];
};

export type InputBatchingStrategy = {
  select(pendingInputs: RuntimeInput[]): InputBatch;
};

export function createConsumeAllInputBatchingStrategy(): InputBatchingStrategy {
  return {
    select(pendingInputs) {
      return {
        selected: [...pendingInputs],
        remaining: [],
      };
    },
  };
}

export function createFixedSizeInputBatchingStrategy(
  size: number,
): InputBatchingStrategy {
  return {
    select(pendingInputs) {
      return {
        selected: pendingInputs.slice(0, size),
        remaining: pendingInputs.slice(size),
      };
    },
  };
}
