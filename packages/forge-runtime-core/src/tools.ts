import { z } from 'zod';

import type {
  RuntimeActionContext,
  RuntimeActionDefinition,
} from 'agent-runtime-core/integrations';

export type ToolExecutionContext = RuntimeActionContext & {
  toolCallId: string;
};

type SchemaLike<TInput> = {
  parse(input: unknown): TInput;
};

export type Tool<
  TInput = unknown,
  TOutput = unknown,
> = {
  id: string;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  execute(
    input: TInput,
    context: ToolExecutionContext,
  ): Promise<TOutput> | TOutput;
};

export type ToolsInput = Record<string, Tool>;
export function createTool<
  TInput,
  TExecute extends (
    input: TInput,
    context: ToolExecutionContext,
  ) => unknown,
>(tool: {
  id: string;
  description: string;
  inputSchema: SchemaLike<TInput>;
  outputSchema?: unknown;
  execute: TExecute;
}): Tool<TInput, Awaited<ReturnType<TExecute>>>;
export function createTool(tool: {
  id: string;
  description: string;
  inputSchema: SchemaLike<unknown>;
  outputSchema?: unknown;
  execute(input: unknown, context: ToolExecutionContext): unknown;
  [key: string]: unknown;
}): Tool<unknown, unknown> {
  return tool as Tool<unknown, unknown>;
}

export function toolToRuntimeAction(
  tool: Tool,
): RuntimeActionDefinition<Record<string, unknown>, unknown> {
  return {
    name: tool.id,
    description: tool.description,
    inputSchema: toRuntimeInputSchema(tool.inputSchema),
    execute(input, context) {
      return tool.execute(input, {
        ...context,
        toolCallId: context.stepId,
      });
    },
  };
}

export function toolsToRuntimeActions(
  tools: ToolsInput | undefined,
): Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> {
  if (!tools) {
    return [];
  }

  return Object.values(tools).map((tool) => toolToRuntimeAction(tool));
}

function toRuntimeInputSchema(inputSchema: unknown): z.ZodType<Record<string, unknown>> {
  if (inputSchema instanceof z.ZodType) {
    return inputSchema as z.ZodType<Record<string, unknown>>;
  }

  return z.object({}).passthrough();
}
