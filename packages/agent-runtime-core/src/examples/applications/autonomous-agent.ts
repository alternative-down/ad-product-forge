import type { AgentRuntimeOptions } from '../../core/runtime.js';
import { createRuntimeHost } from '../../integrations/hosts/runtime-host.js';

export type AutonomousAgentApplicationOptions = {
  runtime: AgentRuntimeOptions;
};

export type AutonomousTickOptions<TPayload> = {
  intervalMs: number;
  inputFactory(): {
    id: string;
    type: string;
    payload: TPayload;
  };
};

export function createAutonomousAgentApplication(
  options: AutonomousAgentApplicationOptions,
) {
  const host = createRuntimeHost({
    runtime: options.runtime,
    scheduler: true,
  });
  const scheduler = host.scheduler;

  if (!scheduler) {
    throw new Error('Autonomous agent application requires a scheduler');
  }

  return {
    runtime: host.runtime,
    journal: host.journal,
    notes: host.notes,
    scheduler,
    async queueInput<TPayload>(input: {
      id: string;
      type: string;
      payload: TPayload;
    }) {
      await host.runtime.dispatch(input);
    },
    scheduleInput<TPayload>(input: {
      id?: string;
      type: string;
      payload: TPayload;
      delayMs: number;
      runAfterDispatch?: boolean;
      maxSteps?: number;
    }) {
      return scheduler.scheduleInput({
        id: input.id,
        target: host.runtime,
        delayMs: input.delayMs,
        runAfterDispatch: input.runAfterDispatch,
        maxSteps: input.maxSteps,
        input: {
          id: input.id ?? crypto.randomUUID(),
          type: input.type,
          payload: input.payload,
        },
      });
    },
    startTicking<TPayload>(tick: AutonomousTickOptions<TPayload>) {
      return scheduler.scheduleRecurringInput({
        target: host.runtime,
        intervalMs: tick.intervalMs,
        inputFactory: tick.inputFactory,
      });
    },
    async runCycle<TPayload>(
      input?: {
        id: string;
        type: string;
        payload: TPayload;
      },
      options: { maxSteps?: number } = {},
    ) {
      if (input) {
        await host.runtime.dispatch(input);
      }

      return host.runtime.run(options);
    },
    stop() {
      scheduler.dispose();
      host.runtime.resetState();
    },
  };
}
