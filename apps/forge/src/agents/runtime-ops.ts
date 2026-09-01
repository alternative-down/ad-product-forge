/**
 * Runner-bounded async helpers for agent-runner.ts.
 *
 * Centralizes the withTimeout(..., RUNNER_AWAIT_TIMEOUT_MS, ...) pattern so
 * the runner's timeout policy lives in exactly one place. Prefer rt() over
 * withTimeout inside runner code: the timeout value and helper semantics
 * remain uniform across the runner, and updating the timeout knob later is a
 * one-line change here instead of a sweep across call sites.
 */
import { withTimeout } from '../utils/async';
import { RUNNER_AWAIT_TIMEOUT_MS } from './agent-runner-generate';

/**
 * Curried runner-timeout helper. Equivalent to
 *   withTimeout(op, RUNNER_AWAIT_TIMEOUT_MS, msg)
 * but locks the timeout value to the runner's policy.
 */
export const rt = <T>(op: Promise<T>, msg: string): Promise<T> =>
  withTimeout(op, RUNNER_AWAIT_TIMEOUT_MS, msg);