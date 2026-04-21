import type { z } from 'zod';

import { createTool, type Tool, type ToolsInput } from './tools.js';

export type WorkflowStepDefinition<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = unknown,
> = {
  id: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  execute(input: {
    inputData: z.infer<TInputSchema>;
  }): Promise<TOutput> | TOutput;
};

export type WorkflowDefinition<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = unknown,
> = {
  id: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  execute(input: z.infer<TInputSchema>): Promise<TOutput>;
};

export type AnyWorkflow = WorkflowDefinition;

export function createStep(step: {
  id: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  execute(input: {
    inputData: any;
  }): any;
}): WorkflowStepDefinition;
export function createStep<
  TInputSchema extends z.ZodTypeAny,
  TExecute extends (input: {
    inputData: z.infer<TInputSchema>;
  }) => unknown,
>(step: {
  id: string;
  inputSchema: TInputSchema;
  outputSchema?: z.ZodTypeAny;
  execute: TExecute;
}): WorkflowStepDefinition<TInputSchema, Awaited<ReturnType<TExecute>>>;
export function createStep(step: {
  id: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  execute(input: {
    inputData: any;
  }): any;
}): WorkflowStepDefinition {
  return step as WorkflowStepDefinition;
}

export function createWorkflow<
  TInputSchema extends z.ZodTypeAny,
  TOutput,
>(workflow: {
  id: string;
  inputSchema: TInputSchema;
  outputSchema?: z.ZodTypeAny;
}): {
  then(step: WorkflowStepDefinition<TInputSchema, TOutput>): {
    commit(): WorkflowDefinition<TInputSchema, TOutput>;
  };
};
export function createWorkflow(workflow: {
  id: string;
  inputSchema: unknown;
  outputSchema?: unknown;
}): {
  then(step: WorkflowStepDefinition): {
    commit(): WorkflowDefinition;
  };
};
export function createWorkflow(workflow: {
  id: string;
  inputSchema: any;
  outputSchema?: any;
}) {
  return {
    then(step: WorkflowStepDefinition) {
      return {
        commit(): WorkflowDefinition {
          return {
            id: workflow.id,
            inputSchema: workflow.inputSchema,
            outputSchema: workflow.outputSchema,
            async execute(input) {
              const parsedInput = workflow.inputSchema.parse(input);
              return step.execute({
                inputData: parsedInput,
              });
            },
          };
        },
      };
    },
  };
}

export function workflowToTool(workflow: AnyWorkflow): Tool {
  return createTool({
    id: workflow.id,
    description: `Execute workflow ${workflow.id}.`,
    inputSchema: workflow.inputSchema as z.ZodTypeAny,
    execute(input) {
      return workflow.execute(input);
    },
  });
}

export function workflowsToTools(
  workflows: Record<string, AnyWorkflow> | undefined,
): ToolsInput {
  if (!workflows) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(workflows).map(([key, workflow]) => [key, workflowToTool(workflow)]),
  );
}
