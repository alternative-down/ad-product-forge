/**
 * agent-runner-plan-next-attempt.ts
 *
 * Extracts `planNextAttempt` from `agent-runner.ts`.
 *
 * Decides what the scheduler should do next: idle, delay, or execute a step.
 * Called by `queueNextStep` in agent-runner.ts.
 *
 * All state is passed as explicit parameters rather than captured in closure
 * scope, making the function fully testable in isolation.
 */
import { withTimeout } from '../utils/async';
import { calculateBudgetDelayMs } from './agent-runner-delay';
import { RUNNER_AWAIT_TIMEOUT_MS } from './agent-runner-generate';
import type { RunnableContract } from './agent-runner-scheduler';

export type PlanNextAttemptResult =
  | { execute: 'idle' }
  | { execute: false; delayMs: number }
  | { execute: true; contractId: string; delayMs: number };

export interface PlanNextAttemptDeps {
  runtimeId: string;
  store: {
    getRunnableContract: (id: string) => Promise<RunnableContract>;
    getContractSpend: (contractId: string) => Promise<number>;
  };
  usage: {
    estimateStepCostUsd: () => Promise<number | null>;
  };
  systemSettings: {
    getSettings: () => Promise<{
      stepDelayEnabled: boolean;
    }>;
  };
  scheduler: {
    getState: () => {
      instant: boolean;
    };
    resetBackoff: () => void;
  };
  calculateBudgetDelayMs?: typeof calculateBudgetDelayMs;
}

export async function planNextAttempt(deps: PlanNextAttemptDeps): Promise<PlanNextAttemptResult> {
  const {
    runtimeId,
    store,
    usage,
    systemSettings,
    scheduler,
    calculateBudgetDelayMs: calcDelay = calculateBudgetDelayMs,
  } = deps;

  const contract = await withTimeout(
    store.getRunnableContract(runtimeId),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent runnable contract lookup timed out for ${runtimeId}`,
  );

  if (!contract) {
    return { execute: 'idle' };
  }

  // Parallelize 3 independent lookups (#6699 — sequential awaits -> Promise.all)
  // Settings is fetched alongside budget data; consumed only after budget check passes
  const [spentUsd, estimatedStepUsd, settings] = await Promise.all([
    withTimeout(
      store.getContractSpend(contract.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent contract spend lookup timed out for ${runtimeId}`,
    ),
    withTimeout(
      usage.estimateStepCostUsd(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent step cost estimate timed out for ${runtimeId}`,
    ),
    withTimeout(
      systemSettings.getSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${runtimeId}`,
    ),
  ]);
  const remainingBudgetUsd = contract.budgetUsd - spentUsd;

  if (estimatedStepUsd !== null && remainingBudgetUsd < estimatedStepUsd) {
    return { execute: 'idle' };
  }

  scheduler.resetBackoff();

  return {
    execute: true,
    contractId: contract.id,
    delayMs:
      scheduler.getState().instant || !settings.stepDelayEnabled
        ? 0
        : calcDelay(contract.endsAt, remainingBudgetUsd, estimatedStepUsd),
  };
}
