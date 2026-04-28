const NO_ACTION_NEEDED_PREFIX = 'NO_ACTION_NEEDED';
const STOP_AND_IDLE_PREFIX = 'STOP_AND_IDLE';

function delay(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (!timeoutId) {
      return;
    }

    clearTimeout(timeoutId);
  });
}

function buildIterationLoopSignature(iteration: {
  text: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
}) {
  return JSON.stringify({
    text: iteration.text.trim(),
    toolCalls: iteration.toolCalls.map((toolCall) => ({
      toolName: toolCall.name,
      args: toolCall.args,
    })),
  });
}

function didIterationUpdateWorkingMemory(iteration: {
  toolCalls: Array<{
    name: string;
  }>;
}) {
  return iteration.toolCalls.some((toolCall) => toolCall.name === 'updateWorkingMemory');
}

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      type: typeof error,
      value: error,
    };
  }

  const extra = Object.fromEntries(
    Object.entries(error).map(([key, value]) => [key, serializeUnknown(value)]),
  );

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...extra,
  };
}

function serializeUnknown(value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map(serializeUnknown);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, serializeUnknown(item)]),
  );
}

function formatAbsentExecutionError(input: {
  stage: string | null;
  lastGenerateProgress?: {
    stage: string;
    at: number;
    detail: Record<string, unknown> | null;
  } | null;
  error: unknown;
}) {
  const stage = input.stage ?? 'unknown';
  const progressLines = input.lastGenerateProgress
    ? [
        `Last progress stage: ${input.lastGenerateProgress.stage}`,
        `Last progress at: ${new Date(input.lastGenerateProgress.at).toISOString()}`,
        ...(input.lastGenerateProgress.detail
          ? [`Last progress detail: ${JSON.stringify(input.lastGenerateProgress.detail)}`]
          : []),
      ]
    : [];

  if (input.error instanceof Error) {
    const details = extractAbsentErrorDetails(input.error);

    return [
      `Stage: ${stage}`,
      `${input.error.name}: ${input.error.message}`,
      ...progressLines,
      ...details,
    ].join('\n');
  }

  return [
    `Stage: ${stage}`,
    String(input.error),
    ...progressLines,
  ].join('\n');
}

function extractAbsentErrorDetails(error: Error) {
  const details: string[] = [];

  if ('code' in error && typeof (error as Record<string, unknown>).code === 'string') {
    details.push(`Error code: ${(error as Record<string, unknown>).code}`);
  }

  if ('statusCode' in error && typeof (error as Record<string, unknown>).statusCode === 'number') {
    details.push(`HTTP status: ${(error as Record<string, unknown>).statusCode}`);
  }

  const detail = formatAbsentErrorDetailValue((error as Record<string, unknown>).detail);
  if (detail !== null) {
    details.push(`Detail: ${detail}`);
  }

  return details;
}

function formatAbsentErrorDetailValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.length > 200 ? `${value.substring(0, 200)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}
function buildStepSystemPrompt(input: {
  agentContextInstructions: string | null | undefined;
}) {
  const sections = [
    input.agentContextInstructions?.trim() ?? null,
  ].filter((value): value is string => Boolean(value));

  if (sections.length === 0) {
    return null;
  }

  return sections.join('\n\n');
}


function extractRunnerControlDirective(result: {
  text: string;
  steps?: Array<{
    response?: {
      uiMessages?: Array<{
        parts?: Array<unknown>;
      }>;
    };
  }>;
}) {
  const texts = [
    result.text,
    ...collectStepTextParts(result.steps ?? []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  if (texts.some((value) => hasExactControlDirective(value, STOP_AND_IDLE_PREFIX))) {
    return 'stop' as const;
  }

  if (texts.some((value) => hasExactControlDirective(value, NO_ACTION_NEEDED_PREFIX))) {
    return 'ignore' as const;
  }

  return null;
}

function extractRunnerControlDirectiveFromIteration(iteration: {
  text: string;
}) {
  const text = iteration.text.trim();

  if (hasExactControlDirective(text, STOP_AND_IDLE_PREFIX)) {
    return 'stop' as const;
  }

  if (hasExactControlDirective(text, NO_ACTION_NEEDED_PREFIX)) {
    return 'ignore' as const;
  }

  return null;
}

function buildRecallStepFromIteration(iteration: {
  text: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults: Array<{
    name: string;
    result: unknown;
  }>;
}) {
  return {
    text: iteration.text,
    toolCalls: iteration.toolCalls.map((toolCall) => ({
      toolName: toolCall.name,
      args: toolCall.args,
    })),
    toolResults: iteration.toolResults.map((toolResult) => ({
      toolName: toolResult.name,
      result: toolResult.result,
    })),
  };
}

function didIterationProduceVisibleAssistantText(iteration: {
  text: string;
  messages: unknown[];
}) {
  if (iteration.text.trim()) {
    return true;
  }

  for (const message of iteration.messages) {
    if (!message || typeof message !== 'object') {
      continue;
    }

    if (!('role' in message) || (message as Record<string, unknown>).role !== 'assistant') {
      continue;
    }

    if (!('content' in message)) {
      continue;
    }

    const content = (message as Record<string, unknown>).content;
    if (typeof content === 'string') {
      if ((content as string).trim()) {
        return true;
      }

      continue;
    }

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue;
      }

      const partObj = part as Record<string, unknown>;
      if (
        'type' in partObj &&
        partObj.type === 'text' &&
        'text' in partObj &&
        typeof partObj.text === 'string' &&
        partObj.text.trim()
      ) {
        return true;
      }
    }
  }

  return false;
}

function collectStepTextParts(steps: Array<{
  response?: {
    uiMessages?: Array<{
      parts?: Array<unknown>;
    }>;
  };
}>) {
  const texts: string[] = [];

  for (const step of steps) {
    for (const message of step.response?.uiMessages ?? []) {
      for (const part of message.parts ?? []) {
        if (!part || typeof part !== 'object') {
          continue;
        }

        const partObj = part as Record<string, unknown>;
        if ('type' in partObj && partObj.type === 'text' && 'text' in partObj && typeof partObj.text === 'string') {
          texts.push(partObj.text as string);
        }
      }
    }
  }

  return texts;
}

function hasExactControlDirective(text: string, directive: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line.includes(directive));
}

export {
  delay,
  withTimeout,
  buildIterationLoopSignature,
  didIterationUpdateWorkingMemory,
  serializeError,
  serializeUnknown,
  formatAbsentExecutionError,
  extractAbsentErrorDetails,
  formatAbsentErrorDetailValue,
  buildStepSystemPrompt,
  extractRunnerControlDirective,
  extractRunnerControlDirectiveFromIteration,
  buildRecallStepFromIteration,
  didIterationProduceVisibleAssistantText,
  collectStepTextParts,
  hasExactControlDirective,
};
