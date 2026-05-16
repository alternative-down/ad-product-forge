/**
 * Unit tests for agent-runner-attempt-lifecycle.ts — attempt tracking.
 * Functions: startGenerateAttempt, finishGenerateAttempt, invalidateInFlightGenerate
 */
import { describe, expect, it, vi } from 'vitest';
import { startGenerateAttempt, finishGenerateAttempt, invalidateInFlightGenerate } from './agent-runner-attempt-lifecycle';

function makeEpochState() {
  return { activeGenerateToken: 0 };
}

function makeDeps(overrides?: Partial<{
  setCurrentGenerateAbortController: ReturnType<typeof vi.fn>;
  currentGenerateAbortController: AbortController | null;
}>) {
  const setFn = vi.fn<(ctrl: AbortController | null) => void>();
  return {
    epochState: makeEpochState(),
    setCurrentGenerateAbortController: setFn,
    currentGenerateAbortController: null as AbortController | null,
    ...overrides,
  } as any;
}

describe('startGenerateAttempt', () => {
  it('advances activeGenerateToken', () => {
    const deps = makeDeps();
    const controller = new AbortController();
    const token = startGenerateAttempt(deps, controller);
    expect(token).toBe(1);
    expect(deps.epochState.activeGenerateToken).toBe(1);
  });

  it('registers abort controller', () => {
    const deps = makeDeps();
    const controller = new AbortController();
    startGenerateAttempt(deps, controller);
    expect(deps.setCurrentGenerateAbortController).toHaveBeenCalledWith(controller);
  });

  it('increments token on each call', () => {
    const deps = makeDeps();
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();
    const t1 = startGenerateAttempt(deps, ctrl1);
    const t2 = startGenerateAttempt(deps, ctrl2);
    expect(t2).toBe(2);
    expect(deps.epochState.activeGenerateToken).toBe(2);
  });
});

describe('finishGenerateAttempt', () => {
  it('clears abort controller when token matches', () => {
    const deps = makeDeps();
    const controller = new AbortController();
    deps.currentGenerateAbortController = controller;
    deps.setCurrentGenerateAbortController(controller);

    deps.epochState.activeGenerateToken = 1;
    finishGenerateAttempt(1, controller, deps);

    expect(deps.setCurrentGenerateAbortController).toHaveBeenCalledWith(null);
    expect(controller.signal.aborted).toBe(true);
  });

  it('does not clear abort controller when token does not match', () => {
    const deps = makeDeps();
    const controller = new AbortController();
    const otherController = new AbortController();
    deps.currentGenerateAbortController = controller;
    deps.setCurrentGenerateAbortController(controller);

    deps.epochState.activeGenerateToken = 2;
    finishGenerateAttempt(1, controller, deps);

    expect(deps.setCurrentGenerateAbortController).not.toHaveBeenCalledWith(null);
    expect(controller.signal.aborted).toBe(true); // aborts regardless
  });

  it('always aborts the controller signal', () => {
    const deps = makeDeps();
    const controller = new AbortController();
    deps.epochState.activeGenerateToken = 99;
    finishGenerateAttempt(1, controller, deps);
    expect(controller.signal.aborted).toBe(true);
  });
});

describe('invalidateInFlightGenerate', () => {
  it('advances token when controller exists', () => {
    const deps = makeDeps();
    const controller = new AbortController();
    deps.currentGenerateAbortController = controller;
    deps.setCurrentGenerateAbortController(controller);

    invalidateInFlightGenerate(deps);

    expect(deps.epochState.activeGenerateToken).toBe(1);
  });

  it('aborts the current controller', () => {
    const deps = makeDeps();
    const controller = new AbortController();
    deps.currentGenerateAbortController = controller;
    deps.setCurrentGenerateAbortController(controller);

    invalidateInFlightGenerate(deps);

    expect(controller.signal.aborted).toBe(true);
  });

  it('clears currentGenerateAbortController to null', () => {
    const deps = makeDeps();
    const controller = new AbortController();
    deps.currentGenerateAbortController = controller;
    deps.setCurrentGenerateAbortController(controller);

    invalidateInFlightGenerate(deps);

    expect(deps.setCurrentGenerateAbortController).toHaveBeenCalledWith(null);
  });

  it('does not throw when no controller is set', () => {
    const deps = makeDeps();
    deps.currentGenerateAbortController = null;
    expect(() => invalidateInFlightGenerate(deps)).not.toThrow();
  });
});