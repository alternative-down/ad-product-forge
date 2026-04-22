import { randomUUID } from 'node:crypto';

import {
  createTextStepContextEntry,
  type RuntimeInputTarget,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

export const SYSTEM_INSTRUCTION_INPUT_TYPE = 'forge-system-instruction';

export function createRuntimeSystemInstructionPlugin(): RuntimePlugin {
  return {
    name: 'forge-system-instruction',
    provideContext(context) {
      return context.pendingInputs
        .filter((pendingInput) => pendingInput.type === SYSTEM_INSTRUCTION_INPUT_TYPE)
        .map((pendingInput, index) =>
          createTextStepContextEntry({
            id: `${pendingInput.id}:${index}`,
            kind: 'system-instruction',
            title: 'System Instruction',
            text:
              typeof pendingInput.payload === 'string'
                ? pendingInput.payload
                : '',
          }));
    },
  };
}

export async function dispatchRuntimeSystemInstruction(input: {
  runtime: RuntimeInputTarget;
  text: string;
}) {
  await input.runtime.dispatch({
    id: randomUUID(),
    type: SYSTEM_INSTRUCTION_INPUT_TYPE,
    payload: input.text,
  });
}
