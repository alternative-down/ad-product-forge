import { generateText, type LanguageModel } from 'ai';
import type { CheckpointedConversationObserver } from 'agent-runtime-core/integrations';

type CreateCheckpointedConversationObserverOptions = {
  model: LanguageModel;
  agentSystemPrompt?: string;
  supportText?: string;
};

export function createCheckpointedConversationObserver(
  input: CreateCheckpointedConversationObserverOptions,
): CheckpointedConversationObserver {
  return {
    async observe(request) {
      const result = await generateText({
        model: input.model,
        system: buildObserverSystemPrompt(input.agentSystemPrompt),
        prompt: buildObserverPrompt({
          supportText: input.supportText,
          messages: request.messages.map((message) => ({
            role: message.role,
            text: message.parts
              .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
              .map((part) => part.text.trim())
              .filter(Boolean)
              .join('\n'),
          })),
        }),
      });
      const text = parseObservationText(result.text);

      if (!text) {
        throw new Error('Checkpointed conversation observer returned no observation text');
      }

      return {
        text,
      };
    },
  };
}

function buildObserverSystemPrompt(agentSystemPrompt?: string) {
  const sections = [
    'You compress older conversation turns into a durable operational observation.',
    'Preserve concrete facts, decisions, active work, blockers, commitments, open questions, and next steps.',
    'Remove repetition and chatter, but keep continuity-critical detail.',
    'Return only a single <observation>...</observation> block.',
  ];

  if (!agentSystemPrompt?.trim()) {
    return sections.join('\n');
  }

  return [
    sections.join('\n'),
    '<agent_system_prompt>',
    agentSystemPrompt.trim(),
    '</agent_system_prompt>',
  ].join('\n\n');
}

function buildObserverPrompt(input: {
  supportText?: string;
  messages: Array<{
    role: string;
    text: string;
  }>;
}) {
  const sections: string[] = [];

  if (input.supportText?.trim()) {
    sections.push([
      '<existing_observations>',
      input.supportText.trim(),
      '</existing_observations>',
    ].join('\n'));
  }

  sections.push('<conversation_batch>');

  for (const message of input.messages) {
    sections.push([
      `<message role="${message.role}">`,
      message.text,
      '</message>',
    ].join('\n'));
  }

  sections.push('</conversation_batch>');
  sections.push('Return only <observation>...</observation>.');

  return sections.join('\n\n');
}

function parseObservationText(text: string) {
  const match = text.match(/<observation>([\s\S]*?)<\/observation>/i);
  return (match?.[1] ?? text).trim();
}
