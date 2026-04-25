import type { ModelMessage } from 'ai';

import type { ConversationMessage, ConversationMessagePart } from 'agent-runtime-core/integrations';

export function normalizeOperationalMemoryText(text: string) {
  const trimmed = text.trim();
  const withoutLegacyPrefix = trimmed
    .replace(/^Checkpoint summary:\s*/i, '')
    .replace(/^Active reflection:\s*/i, '')
    .replace(/^Active observation:\s*/i, '')
    .trim();
  const envelopeMatch = withoutLegacyPrefix.match(/^<observations>([\s\S]*?)<\/observations>$/i);

  return (envelopeMatch?.[1] ?? withoutLegacyPrefix).trim();
}

export function normalizeOperationalMemoryMessage(message: ConversationMessage): ConversationMessage {
  if (!message.operationalMemoryType) {
    return message;
  }

  return {
    ...message,
    role: 'assistant',
    parts: message.parts.map((part) => normalizeOperationalMemoryPart(part)),
  };
}

export function createConversationModelMessages(messages: ConversationMessage[]): ModelMessage[] {
  const normalizedMessages = messages.map(normalizeOperationalMemoryMessage);
  const availableToolCallIds = new Set<string>();
  const fulfilledToolCallIds = new Set<string>();
  const modelMessages: ModelMessage[] = [];

  for (const message of normalizedMessages) {
    if (message.role === 'assistant') {
      const assistantParts = createAssistantContentParts(message, availableToolCallIds, fulfilledToolCallIds);

      if (assistantParts.length > 0) {
        modelMessages.push({
          role: 'assistant',
          content: assistantParts,
        } as ModelMessage);
      }

      continue;
    }

    if (message.role === 'tool') {
      const toolParts = createToolResultParts(message, availableToolCallIds, fulfilledToolCallIds);

      if (toolParts.length > 0) {
        modelMessages.push({
          role: 'tool',
          content: toolParts,
        } as ModelMessage);
      }

      continue;
    }

    if (message.role === 'system') {
      const systemText = extractTextParts(message.parts).join('\n').trim();

      if (systemText) {
        modelMessages.push({
          role: 'system',
          content: systemText,
        } as ModelMessage);
      }

      continue;
    }

    const userParts = createUserContentParts(message.parts);

    if (userParts.length > 0) {
      modelMessages.push({
        role: message.role === 'external' ? 'user' : message.role,
        content: userParts,
      } as unknown as ModelMessage);
    }
  }

  return modelMessages.filter((message) => {
    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      return true;
    }

    return message.content.every((part) =>
      part.type !== 'tool-result' || fulfilledToolCallIds.has(part.toolCallId));
  });
}

function normalizeOperationalMemoryPart(part: ConversationMessagePart): ConversationMessagePart {
  if ((part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string') {
    return {
      ...part,
      text: normalizeOperationalMemoryText(part.text),
    };
  }

  return part;
}

function createAssistantContentParts(
  message: ConversationMessage,
  availableToolCallIds: Set<string>,
  fulfilledToolCallIds: Set<string>,
) {
  const parts: Array<Record<string, unknown>> = [];

  for (const part of message.parts) {
    if (part.type === 'text') {
      parts.push({
        type: 'text',
        text: part.text,
      });
      continue;
    }

    if (part.type === 'reasoning') {
      parts.push({
        type: 'reasoning',
        text: part.text,
        ...(part.providerMetadata?.anthropic
          ? {
              providerOptions: {
                anthropic: {
                  ...(typeof part.providerMetadata.anthropic.signature === 'string'
                    ? { signature: part.providerMetadata.anthropic.signature }
                    : {}),
                  ...(typeof part.providerMetadata.anthropic.redactedData === 'string'
                    ? { redactedData: part.providerMetadata.anthropic.redactedData }
                    : {}),
                },
              },
            }
          : {}),
      });
    }
  }

  const toolInvocations = Array.isArray(message.metadata?.toolInvocations)
    ? message.metadata.toolInvocations
    : [];

  for (const toolInvocation of toolInvocations) {
    if (typeof toolInvocation !== 'object' || toolInvocation === null) {
      continue;
    }

    if (typeof toolInvocation.toolCallId !== 'string') {
      continue;
    }

    availableToolCallIds.add(toolInvocation.toolCallId);
    parts.push({
      type: 'tool-call',
      toolCallId: toolInvocation.toolCallId,
      toolName: typeof toolInvocation.toolName === 'string' ? toolInvocation.toolName : 'unknown',
      input: isRecord(toolInvocation.args) ? toolInvocation.args : {},
    });
  }

  return parts;
}

function createToolResultParts(
  message: ConversationMessage,
  availableToolCallIds: Set<string>,
  fulfilledToolCallIds: Set<string>,
) {
  const parts: Array<Record<string, unknown>> = [];
  const toolResults = Array.isArray(message.metadata?.toolResults)
    ? message.metadata.toolResults
    : [];

  for (const toolResult of toolResults) {
    if (typeof toolResult !== 'object' || toolResult === null) {
      continue;
    }

    if (typeof toolResult.toolCallId !== 'string') {
      continue;
    }

    if (!availableToolCallIds.has(toolResult.toolCallId)) {
      continue;
    }

    fulfilledToolCallIds.add(toolResult.toolCallId);
    parts.push({
      type: 'tool-result',
      toolCallId: toolResult.toolCallId,
      toolName: typeof toolResult.toolName === 'string' ? toolResult.toolName : 'unknown',
      output: {
        type: 'json',
        value: toolResult.result,
      },
    });
  }

  return parts;
}

function createUserContentParts(parts: ConversationMessagePart[]) {
  const content: Array<Record<string, unknown>> = [];

  for (const part of parts) {
    if (part.type === 'text') {
      content.push({
        type: 'text',
        text: part.text,
      });
      continue;
    }

    if (part.type === 'image') {
      content.push({
        type: 'image',
        image: `data:${part.mimeType};base64,${Buffer.from(part.bytes).toString('base64')}`,
      });
      continue;
    }

    if (part.type === 'file') {
      content.push({
        type: 'file',
        mediaType: part.mimeType,
        filename: part.name,
        data: part.bytes,
      });
    }
  }

  return content;
}

function extractTextParts(parts: ConversationMessagePart[]) {
  return parts.flatMap((part) =>
    (part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string'
      ? [part.text]
      : []);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
