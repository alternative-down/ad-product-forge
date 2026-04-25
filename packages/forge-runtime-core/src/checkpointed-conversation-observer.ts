import { generateText, type LanguageModel } from 'ai';
import type { CheckpointedConversationObserver } from 'agent-runtime-core/integrations';

import {
  normalizeOperationalMemoryText,
} from './conversation-model-messages.js';
import {
  buildObserverPrompt,
  buildObserverSystemPrompt,
  parseObserverOutput,
} from './operational-memory-prompting.js';

type CreateCheckpointedConversationObserverOptions = {
  model: LanguageModel;
  agentSystemPrompt?: string;
  loadSupportText?: () => Promise<string | null>;
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
        prompt: buildObserverPrompt(supportText?.trim() || undefined, request.messages),
      });
      const parsed = parseObserverOutput(result.text);
      const text = normalizeOperationalMemoryText(parsed.observations);

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
