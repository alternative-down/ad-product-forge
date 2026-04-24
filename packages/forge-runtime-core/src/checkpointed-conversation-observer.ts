import { generateText, type LanguageModel } from 'ai';
import {
  buildObserverPrompt,
  buildObserverSystemPrompt,
  parseObserverOutput,
} from '@mastra/memory/processors';
import type { CheckpointedConversationObserver } from 'agent-runtime-core/integrations';

type CreateCheckpointedConversationObserverOptions = {
  model: LanguageModel;
  agentSystemPrompt?: string;
  loadSupportText?: () => Promise<string | null>;
};

type ObserverPromptMessage = {
  id: string;
  role: 'assistant' | 'system' | 'user';
  createdAt: Date;
  content: {
    content: string;
    format: 2;
    parts: Array<{
      type: 'text';
      text: string;
    }>;
  };
};

export function createCheckpointedConversationObserver(
  input: CreateCheckpointedConversationObserverOptions,
): CheckpointedConversationObserver {
  return {
    async observe(request) {
      const supportText = await input.loadSupportText?.();
      const result = await generateText({
        model: input.model,
        system: buildAlignedObserverSystemPrompt(input.agentSystemPrompt),
        prompt: buildObserverPrompt(
          supportText ?? undefined,
          request.messages.map((message) => toObserverPromptMessage(message)),
        ),
      });
      const parsed = parseObserverOutput(typeof result.text === 'string' ? result.text : '');
      const text = typeof parsed.observations === 'string' ? parsed.observations.trim() : '';

      if (!text) {
        throw new Error('Checkpointed conversation observer returned no observation text');
      }

      return {
        text,
      };
    },
  };
}

function buildAlignedObserverSystemPrompt(agentSystemPrompt?: string) {
  const observerSystemPrompt = buildObserverSystemPrompt(false);

  if (typeof agentSystemPrompt !== 'string' || !agentSystemPrompt.trim()) {
    return observerSystemPrompt;
  }

  return [
    observerSystemPrompt,
    '<main_agent_system_prompt>',
    'Use the following main agent system prompt as alignment context. Keep observations aligned with the same role, scope, operating style, and priorities.',
    agentSystemPrompt.trim(),
    '</main_agent_system_prompt>',
  ].join('\n\n');
}

function toObserverPromptMessage(message: {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
  parts: Array<{
    type: string;
    text?: string;
  }>;
  createdAt: string;
}): ObserverPromptMessage {
  const text = buildObserverMessageText(message);

  return {
    id: message.id,
    role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
    createdAt: new Date(message.createdAt),
    content: {
      content: text,
      format: 2,
      parts: [{
        type: 'text',
        text,
      }],
    },
  };
}

function buildObserverMessageText(message: {
  parts: Array<{
    type: string;
    text?: string;
  }>;
  metadata?: Record<string, unknown>;
}) {
  return [
    ...message.parts
      .filter((part): part is { type: string; text: string } =>
        (part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string')
      .map((part) => part.text.trim())
      .filter(Boolean),
    ...getObserverToolInvocationTexts(message.metadata),
    ...getObserverToolResultTexts(message.metadata),
  ].join('\n');
}

function getObserverToolInvocationTexts(metadata: Record<string, unknown> | undefined) {
  const toolInvocations = Array.isArray(metadata?.toolInvocations)
    ? metadata.toolInvocations
    : [];

  return toolInvocations.flatMap((toolInvocation) => {
    if (typeof toolInvocation !== 'object' || toolInvocation === null) {
      return [];
    }

    const toolName = typeof toolInvocation.toolName === 'string'
      ? toolInvocation.toolName
      : 'unknown';
    const args = serializeObserverValue('args' in toolInvocation ? toolInvocation.args : undefined);

    return [[
      `Tool call: ${toolName}`,
      args,
    ].filter(Boolean).join('\n')];
  });
}

function getObserverToolResultTexts(metadata: Record<string, unknown> | undefined) {
  const toolResults = Array.isArray(metadata?.toolResults)
    ? metadata.toolResults
    : [];

  return toolResults.flatMap((toolResult) => {
    if (typeof toolResult !== 'object' || toolResult === null) {
      return [];
    }

    const toolName = typeof toolResult.toolName === 'string'
      ? toolResult.toolName
      : 'unknown';
    const result = serializeObserverValue('result' in toolResult ? toolResult.result : undefined);

    return [[
      `Tool result: ${toolName}`,
      result,
    ].filter(Boolean).join('\n')];
  });
}

function serializeObserverValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}
