import type { AnyWorkflow } from './workflows.js';
import type { ToolsInput } from './tools.js';

export type ForgeWorkflowInput =
  | Record<string, AnyWorkflow>
  | ((context: unknown) => Promise<Record<string, AnyWorkflow>> | Record<string, AnyWorkflow>);

export type AgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = {
  id: TAgentId;
  name: string;
  description?: string;
  instructions?: string;
  model: unknown;
  tools?: TTools;
  workflows?: ForgeWorkflowInput;
  agents?: Record<string, unknown>;
  output?: TOutput;
  requestContext?: TRequestContext;
};
