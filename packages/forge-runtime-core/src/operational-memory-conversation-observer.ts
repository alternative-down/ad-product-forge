import { generateText, type LanguageModel } from 'ai';
import type { OperationalMemoryConversationObserver } from 'agent-runtime-core/integrations';

import { normalizeOperationalMemoryText } from './conversation-model-messages.js';
import { forgeDebug } from './debug.js';
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
      const startedAt = Date.now();
      let supportText: string | undefined;
      let result: Awaited<ReturnType<typeof generateText>> | null = null;

      try {
        supportText = (await input.loadSupportText?.()) ?? undefined;
        forgeDebug({
          scope: 'operational-memory-observer',
          level: 'info',
          message: 'observation support loaded',
          context: {
            threadId: request.threadId,
            durationMs: Date.now() - startedAt,
            sourceMessageCount: request.messages.length,
            supportTextLength: supportText?.length ?? 0,
          },
        });
      } catch (err) {
        console.warn(
          '[createOperationalMemoryConversationObserver] loadSupportText failed',
          err instanceof Error ? err.message : String(err),
        );
      }

      try {
        const generationStartedAt = Date.now();
        forgeDebug({
          scope: 'operational-memory-observer',
          level: 'info',
          message: 'observation model request starting',
          context: { threadId: request.threadId, sourceMessageCount: request.messages.length },
        });
        result = await generateText({
          model: input.model,
          system: buildAlignedObserverSystemPrompt(input.agentSystemPrompt),
          prompt: buildObserverPrompt(supportText?.trim(), request.messages),
        });
        forgeDebug({
          scope: 'operational-memory-observer',
          level: 'info',
          message: 'observation model request completed',
          context: { threadId: request.threadId, durationMs: Date.now() - generationStartedAt },
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
        throw new Error('Operational conversation observer returned no observation text');
      }

      forgeDebug({
        scope: 'operational-memory-observer',
        level: 'info',
        message: 'observation completed',
        context: {
          threadId: request.threadId,
          durationMs: Date.now() - startedAt,
          outputLength: text.length,
        },
      });

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
