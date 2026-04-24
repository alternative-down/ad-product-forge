import type { RuntimeAgentSessionGenerateOptions, RuntimeAgentSessionIteration } from './runtime-agent-session.js';
import type { RuntimeSessionModelMessage } from './runtime-agent-session-messages.js';

export function createRuntimeAgentSessionIteration(input: {
  iterationNumber: number;
  responseMessages: RuntimeSessionModelMessage[];
  text: string;
  finishReason: string | undefined;
  runId: string;
  threadId: string;
  resourceId: string;
  agentId: string;
  agentName: string;
}): RuntimeAgentSessionIteration {
  const toolCalls = input.responseMessages.flatMap((message, messageIndex) => {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      return [];
    }

    return message.content
      .filter((part): part is Extract<typeof part, { type: 'tool-call' }> => part.type === 'tool-call')
      .map((part, partIndex) => ({
        id: part.toolCallId || `${input.iterationNumber}:${messageIndex}:${partIndex}`,
        name: part.toolName,
        args: isRecord(part.input) ? part.input : {},
      }));
  });
  const toolResults = input.responseMessages.flatMap((message, messageIndex) => {
    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      return [];
    }

    return message.content
      .filter((part): part is Extract<typeof part, { type: 'tool-result' }> => part.type === 'tool-result')
      .map((part, partIndex) => ({
        id: part.toolCallId || `${input.iterationNumber}:${messageIndex}:${partIndex}`,
        name: part.toolName,
        result: unwrapToolOutput(part.output),
      }));
  });

  return {
    iteration: input.iterationNumber,
    text: input.text,
    toolCalls,
    toolResults,
    isFinal: toolCalls.length === 0 && toolResults.length === 0,
    finishReason: input.finishReason ?? 'stop',
    runId: input.runId,
    threadId: input.threadId,
    resourceId: input.resourceId,
    agentId: input.agentId,
    agentName: input.agentName,
    messages: input.responseMessages,
  };
}

export async function resolveRuntimeAgentSessionContinuation(input: {
  options: RuntimeAgentSessionGenerateOptions;
  iteration: RuntimeAgentSessionIteration;
}): Promise<{
  continue: boolean;
  feedback?: string;
  feedbackMessages?: Array<{
    role: 'assistant' | 'user';
    content: string;
  }>;
}> {
  const result = await input.options.onIterationComplete?.(input.iteration);

  if (result?.continue !== undefined) {
    return {
      continue: result.continue,
      feedback: result.feedback,
      feedbackMessages: result.feedbackMessages,
    };
  }

  return {
    continue: input.iteration.toolCalls.length > 0 || input.iteration.toolResults.length > 0,
    feedback: result?.feedback,
    feedbackMessages: result?.feedbackMessages,
  };
}

function unwrapToolOutput(output: unknown) {
  if (
    typeof output === 'object'
    && output !== null
    && 'type' in output
    && 'value' in output
    && output.type === 'json'
  ) {
    return (output as { value: unknown }).value;
  }

  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
