export type AgentConfig<
  TAgentId extends string = string,
  TTools extends Record<string, unknown> = Record<string, unknown>,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = {
  id: TAgentId;
  name: string;
  description?: string;
  instructions?: string;
  model: unknown;
  tools?: TTools;
  agents?: Record<string, unknown>;
  output?: TOutput;
  requestContext?: TRequestContext;
};
