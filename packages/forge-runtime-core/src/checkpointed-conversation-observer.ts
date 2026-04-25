import { generateText, type LanguageModel } from 'ai';
import type { CheckpointedConversationObserver } from 'agent-runtime-core/integrations';

import {
  createConversationModelMessages,
  normalizeOperationalMemoryText,
} from './conversation-model-messages.js';
import {
  buildObserverSystemPrompt,
  buildObserverTaskUserMessage,
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
        messages: [
          {
            role: 'user',
            content: 'Analyze the following persisted conversation messages in order.',
          },
          ...createConversationModelMessages(request.messages),
          {
            role: 'user',
            content: buildObserverTaskUserMessage(supportText?.trim() || undefined),
          },
        ],
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
