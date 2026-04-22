import { generateText, type LanguageModel } from 'ai';
import type { CheckpointedConversationObserver } from 'agent-runtime-core/integrations';

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
        system: buildObserverSystemPrompt(input.agentSystemPrompt),
        prompt: buildObserverPrompt({
          supportText: supportText ?? undefined,
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
    'Return XML with a single <observations>...</observations> block.',
  ].join('\n');

  if (!agentSystemPrompt?.trim()) {
    return sections;
  }

  return [
    sections,
    '<main_agent_system_prompt>',
    'Use the following main agent system prompt as alignment context. Keep observations aligned with the same role, scope, operating style, and priorities.',
    agentSystemPrompt.trim(),
    '</main_agent_system_prompt>',
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
  sections.push('Return only <observations>...</observations>.');

  return sections.join('\n\n');
}

function parseObservationText(text: string) {
  const match = text.match(/<observations>([\s\S]*?)<\/observations>/i);
  return (match?.[1] ?? text).trim();
}
