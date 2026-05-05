import { generateText, type LanguageModel } from 'ai';
import type { OperationalMemoryConversationObserver } from 'agent-runtime-core/integrations';

import {
  normalizeOperationalMemoryText,
} from './conversation-model-messages.js';
import {
  buildObserverPrompt,
  buildObserverSystemPrompt,
  parseObserverOutput,
} from './operational-memory-prompting.js';

type CreateOperationalMemoryConversationObserverOptions = {
  model: LanguageModel;
  agentSystemPrompt?: string;
  loadSupportText?: () => Promise<string | null>;
};

export function createOperationalMemoryConversationObserver(
  input: CreateOperationalMemoryConversationObserverOptions,
): OperationalMemoryConversationObserver {
  return {
    async observe(request) {
      let supportText: string | undefined;
      let result: Awaited<ReturnType<typeof generateText>> | null = null;

      try {
        supportText = await input.loadSupportText?.();
      } catch (err) {
        console.warn(
          '[createOperationalMemoryConversationObserver] loadSupportText failed',
          err instanceof Error ? err.message : String(err),
        );
      }

      try {
        result = await generateText({
          model: input.model,
          system: buildAlignedObserverSystemPrompt(input.agentSystemPrompt),
          prompt: buildObserverPrompt(supportText?.trim(), request.messages),
        });
      } catch (err) {
        console.warn(
          '[createOperationalMemoryConversationObserver] generateText failed',
          err instanceof Error ? err.message : String(err),
        );
        throw err;
      }

      const parsed = parseObserverOutput(result.text);
      const text = normalizeOperationalMemoryText(parsed.observations);

      if (!text) {
        throw new Error(
          'Operational conversation observer returned no observation text',
        );
      }

      return { text };
    },
  };
}

function buildAlignedObserverSystemPrompt(agentSystemPrompt?: string) {
  const basePrompt = buildObserverSystemPrompt();

  if (typeof agentSystemPrompt !== 'string' || !agentSystemPrompt.trim()) {
    return basePrompt;
  }

  return [
    basePrompt,
    '<main_agent_system_prompt>',
    'Use the following main agent system prompt only as alignment context.',
    agentSystemPrompt.trim(),
    '</main_agent_system_prompt>',
  ].join('\n\n');
}