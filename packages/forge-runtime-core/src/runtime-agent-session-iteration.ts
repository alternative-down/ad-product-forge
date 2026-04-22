import type { RuntimeAgentSessionGenerateOptions, RuntimeAgentSessionIteration } from './runtime-agent-session.js';

type RuntimeAgentSessionRecord = {
  id: string;
  stepNumber: number;
  continuation: RuntimeAgentSessionIteration['finishReason'];
  modelResponse: {
    segments: Array<{
      kind: 'message' | string;
      text: string;
    }>;
    actionRequests: Array<{
      name: string;
      input: Record<string, unknown>;
    }>;
  };
  actionResults: Array<{
    name: string;
    output: unknown;
  }>;
};

export function createRuntimeAgentSessionIteration(input: {
  record: RuntimeAgentSessionRecord;
  runId: string;
  threadId: string;
  resourceId: string;
  agentId: string;
  agentName: string;
}): RuntimeAgentSessionIteration {
  return {
    iteration: input.record.stepNumber,
    text: input.record.modelResponse.segments
      .filter((segment) => segment.kind === 'message')
      .map((segment) => segment.text)
      .join(''),
    toolCalls: input.record.modelResponse.actionRequests.map((actionRequest, index) => ({
      id: `${input.record.id}:${index}`,
      name: actionRequest.name,
      args: actionRequest.input,
    })),
    toolResults: input.record.actionResults.map((actionResult, index) => ({
      id: `${input.record.id}:${index}`,
      name: actionResult.name,
      result: actionResult.output,
    })),
    isFinal: input.record.continuation !== 'continue',
    finishReason: input.record.continuation,
    runId: input.runId,
    threadId: input.threadId,
    resourceId: input.resourceId,
    agentId: input.agentId,
    agentName: input.agentName,
    messages: [],
  };
}

export async function resolveRuntimeAgentSessionContinuation(input: {
  options: RuntimeAgentSessionGenerateOptions;
  iteration: RuntimeAgentSessionIteration;
}): Promise<{
  continue: boolean;
  feedback?: string;
}> {
  const result = await input.options.onIterationComplete?.(input.iteration);

  if (result?.continue !== undefined) {
    return {
      continue: result.continue,
      feedback: result.feedback,
    };
  }

  return {
    continue: input.iteration.toolCalls.length > 0 || input.iteration.toolResults.length > 0,
    feedback: result?.feedback,
  };
}
