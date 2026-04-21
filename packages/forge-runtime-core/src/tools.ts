import type { z } from 'zod';

import type {
  RuntimeActionContext,
  RuntimeActionDefinition,
} from 'agent-runtime-core/integrations';

export type ToolExecutionContext = RuntimeActionContext & {
  toolCallId: string;
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

export function createTool(tool: {
  id: string;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  execute(input: any, context: ToolExecutionContext): any;
  [key: string]: unknown;
}): Tool<any, any>;
export function createTool<
  TInputSchema extends z.ZodTypeAny,
  TExecute extends (
    input: z.infer<TInputSchema>,
    context: ToolExecutionContext,
  ) => unknown,
>(tool: {
  id: string;
  description: string;
  inputSchema: TInputSchema;
  outputSchema?: z.ZodTypeAny;
  execute: TExecute;
}): Tool<z.infer<TInputSchema>, Awaited<ReturnType<TExecute>>>;
export function createTool(tool: {
  id: string;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  execute(input: any, context: ToolExecutionContext): any;
  [key: string]: unknown;
}): Tool<any, any> {
  return tool as Tool<any, any>;
}

export function toolToRuntimeAction(
  tool: Tool,
): RuntimeActionDefinition<Record<string, unknown>, unknown> {
  return {
    name: tool.id,
    description: tool.description,
    inputSchema: tool.inputSchema as z.ZodType<Record<string, unknown>>,
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
