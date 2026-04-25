import { generateText, type LanguageModel, type ModelMessage } from 'ai';
import type { CheckpointedConversationObserver } from 'agent-runtime-core/integrations';

import {
  createConversationModelMessages,
  normalizeOperationalMemoryText,
} from './conversation-model-messages.js';

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
      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: 'Analyze the following persisted conversation messages in order. Produce one compact observation that preserves concrete facts, active work, unresolved issues, and anything needed for continuity.',
        },
        ...(supportText?.trim()
          ? [{
              role: 'user' as const,
              content: `Additional alignment context:\n${supportText.trim()}`,
            }]
          : []),
        ...createConversationModelMessages(request.messages),
        {
          role: 'user',
          content: [
            'Return only the observation text.',
            'Do not add labels, XML, headings, or explanations.',
            'Do not describe the message format.',
          ].join('\n'),
        },
      ];
      const result = await generateText({
        model: input.model,
        system: buildAlignedObserverSystemPrompt(input.agentSystemPrompt),
        messages,
      });
      const text = normalizeOperationalMemoryText(result.text);

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
  const basePrompt = [
    'You compress batches of agent conversation into one durable operational observation.',
    'Preserve concrete facts, decisions, active work, blockers, dependencies, and anything needed for continuity.',
    'Keep it dense and literal.',
  ].join('\n');

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
