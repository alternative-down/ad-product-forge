import { z } from 'zod';

import {
  createDefaultContextFormatter,
  type ContextFormatter,
} from '../../core/context-formatters.js';
import type { RuntimeInput, StepContextPart } from '../../core/types.js';

const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const imagePartSchema = z.object({
  type: z.literal('image'),
  mimeType: z.string().min(1),
  bytes: z.instanceof(Uint8Array),
});

export const multimodalRuntimeInputPayloadSchema = z.object({
  parts: z.array(z.union([textPartSchema, imagePartSchema])).min(1),
});

export type MultimodalRuntimeInputPayload = z.infer<typeof multimodalRuntimeInputPayloadSchema>;

export function createMultimodalRuntimeInputPayload(
  parts: StepContextPart[],
): MultimodalRuntimeInputPayload {
  return multimodalRuntimeInputPayloadSchema.parse({
    parts,
  });
}

export function isMultimodalRuntimeInputPayload(
  payload: unknown,
): payload is MultimodalRuntimeInputPayload {
  return multimodalRuntimeInputPayloadSchema.safeParse(payload).success;
}

export function createMultimodalContextFormatter(): ContextFormatter {
  const fallback = createDefaultContextFormatter();

  return {
    formatInput(input: RuntimeInput) {
      if (!isMultimodalRuntimeInputPayload(input.payload)) {
        return fallback.formatInput(input);
      }

      return {
        id: input.id,
        kind: `input:${input.type}`,
        title: `Input ${input.type}`,
        content: input.payload.parts,
      };
    },
    formatActionResults(previousStepNumber, actionResults) {
      return fallback.formatActionResults(previousStepNumber, actionResults);
    },
  };
}
