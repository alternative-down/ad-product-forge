import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

import type { ActionResult, StepActionDescriptor } from './types.js';

export type RuntimeActionContext = {
  runtimeId: string;
  stepId: string;
  stepNumber: number;
};

export type RuntimeActionDefinition<TInput extends Record<string, unknown>, TOutput> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  parseInput?(input: Record<string, unknown>): TInput;
  execute(input: TInput, context: RuntimeActionContext): Promise<TOutput> | TOutput;
};

type RuntimeActionDefinitionAny = RuntimeActionDefinition<Record<string, unknown>, unknown>;

export class RuntimeActionRegistry {
  private readonly actions = new Map<string, RuntimeActionDefinitionAny>();

  register<TInput extends Record<string, unknown>, TOutput>(
    action: RuntimeActionDefinition<TInput, TOutput>,
  ) {
    this.actions.set(action.name, action as RuntimeActionDefinitionAny);
  }

  describe(): StepActionDescriptor[] {
    return Array.from(this.actions.values(), (action) => ({
      name: action.name,
      description: action.description,
      inputSchema: action.inputSchema,
      inputSchemaText: JSON.stringify(zodToJsonSchema(action.inputSchema as any), null, 2),
    }));
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    context: RuntimeActionContext,
  ): Promise<ActionResult> {
    const action = this.actions.get(name);

    if (!action) {
      throw new Error(`Unknown action: ${name}`);
    }

    const parsedInput = action.parseInput
      ? action.parseInput(input)
      : action.inputSchema.parse(input);
    const output = await action.execute(parsedInput, context);

    return {
      name,
      input: parsedInput,
      output,
    };
  }
}
