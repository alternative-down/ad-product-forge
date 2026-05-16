export type LoopDetector = {
  recordIteration(iteration: number): boolean;
  reset(): void;
  isStuck(): boolean;
  getSignatureCount(): number;
};

export type LoopDetectorState = {
  lastLoopSignature: string | null;
  repeatedLoopCount: number;
};

export function createLoopDetector(
  state: LoopDetectorState,
  options: {
    stuckLoopRepeatLimit?: number;
  } = {},
) {
  const stuckLoopRepeatLimit = options.stuckLoopRepeatLimit ?? 6;

  function reset() {
    state.lastLoopSignature = null;
    state.repeatedLoopCount = 0;
  }

  function register(signature: string): number {
    if (state.lastLoopSignature === signature) {
      state.repeatedLoopCount += 1;
      return state.repeatedLoopCount;
    }

    state.lastLoopSignature = signature;
    state.repeatedLoopCount = 1;
    return state.repeatedLoopCount;
  }

  function isStuck(): boolean {
    return state.repeatedLoopCount >= stuckLoopRepeatLimit;
  }

  function getSignatureCount(): number {
    return state.repeatedLoopCount;
  }

  function getCurrentSignature(): string | null {
    return state.lastLoopSignature;
  }

  function getState(): LoopDetectorState {
    return state;
  }

  return {
    reset,
    register,
    isStuck,
    getSignatureCount,
    getCurrentSignature,
    getState,
  };
}
