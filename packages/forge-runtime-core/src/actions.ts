import { z } from 'zod';

import {
  createWorkspaceActionDefinitions,
  type RuntimeActionDefinition,
  type WorkspaceGateway,
} from 'agent-runtime-core/integrations';

export type ForgeInternalAgentInvocation = {
  targetAgentId: string;
  prompt: string;
  metadata?: Record<string, unknown>;
};

export type ForgeInternalAgentInvocationResult = {
  accepted: boolean;
  runId?: string;
  output?: unknown;
};

export type ForgeInternalAgentInvoker = (
  input: ForgeInternalAgentInvocation,
) => Promise<ForgeInternalAgentInvocationResult>;

export function createForgeWorkspaceActions(workspace: WorkspaceGateway) {
  return createWorkspaceActionDefinitions(workspace);
}

export function createForgeInternalAgentAction(
  invoke: ForgeInternalAgentInvoker,
): RuntimeActionDefinition<Record<string, unknown>, unknown> {
  const inputSchema = z.object({
    targetAgentId: z.string().min(1),
    prompt: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }) as unknown as RuntimeActionDefinition<Record<string, unknown>, unknown>['inputSchema'];

  return {
    name: 'forge_call_internal_agent',
    description: 'Dispatch work to another Forge agent runtime.',
    inputSchema,
    async execute(input) {
      return invoke(input as ForgeInternalAgentInvocation);
    },
  };
}
