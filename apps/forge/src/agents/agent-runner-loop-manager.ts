// =============================================================================
// Loop state management
// Wraps createLoopDetector with manager functions for agent-runner.ts
// =============================================================================

import { createLoopDetector } from './agent-runner-loop-detector';

export interface LoopManagerState {
  lastLoopSignature: string | null;
  repeatedLoopCount: number;
}

export interface LoopManager {
  reset(): void;
  register(signature: string): number;
  isStuck(): boolean;
  getSignatureCount(): number;
  getCurrentSignature(): string | null;
  getState(): LoopManagerState;
}

export function createLoopManager(
  state: LoopManagerState,
  options: {
    stuckLoopRepeatLimit?: number;
  } = {},
): LoopManager {
  const detector = createLoopDetector(state, options);

  function reset(): void {
    detector.reset();
  }

  function register(signature: string): number {
    return detector.register(signature);
  }

  function isStuck(): boolean {
    return detector.isStuck();
  }

  function getSignatureCount(): number {
    return detector.getSignatureCount();
  }

  function getCurrentSignature(): string | null {
    return detector.getCurrentSignature();
  }

  function getState(): LoopManagerState {
    return state;
  }

  return { reset, register, isStuck, getSignatureCount, getCurrentSignature, getState };
}
