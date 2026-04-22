import { randomUUID } from 'node:crypto';

import type { RuntimeInputTarget, RuntimePlugin } from 'agent-runtime-core/integrations';

export const PROVIDER_OPTIONS_INPUT_TYPE = 'forge-provider-options';

type RuntimeProviderOptionValue =
  | string
  | number
  | boolean
  | null
  | RuntimeProviderOptionValue[]
  | {
      [key: string]: RuntimeProviderOptionValue | undefined;
    };

export function createRuntimeProviderOptionsPlugin(): RuntimePlugin {
  return {
    name: 'forge-provider-options',
    resolveModelRequest(context) {
      const providerOptions = context.pendingInputs
        .filter((pendingInput) => pendingInput.type === PROVIDER_OPTIONS_INPUT_TYPE)
        .map((pendingInput) => pendingInput.payload)
        .find((value): value is Record<string, {
          [key: string]: RuntimeProviderOptionValue | undefined;
        }> => (
          typeof value === 'object' && value !== null
        ));

      if (!providerOptions) {
        return {};
      }

      return {
        providerOptions,
      };
    },
  };
}

export async function dispatchRuntimeProviderOptions(input: {
  runtime: RuntimeInputTarget;
  providerOptions: Record<string, unknown>;
}) {
  await input.runtime.dispatch({
    id: randomUUID(),
    type: PROVIDER_OPTIONS_INPUT_TYPE,
    payload: input.providerOptions,
  });
}
