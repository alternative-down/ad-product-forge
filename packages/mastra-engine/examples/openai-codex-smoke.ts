import { Agent } from '@mastra/core/agent';

import { openaiCodexProvider } from '../src/providers/openai-codex';

async function main() {
  const agent = new Agent({
    id: 'openai-codex-smoke',
    name: 'OpenAI Codex Smoke',
    instructions: {
      role: 'system',
      content: 'Responda de forma curta e direta.',
      providerOptions: {
        openai: {
          instructions: 'Responda de forma curta e direta.',
          store: false,
        },
      },
    },
    model: openaiCodexProvider('gpt-5.4', {
      // thinkingLevel: 'low',
    }),
  });

  const result = await agent.generate('Responda exatamente com: ok', {
    providerOptions: {
      openai: {
        instructions: 'Responda de forma curta e direta.',
        store: false,
      },
    },
  });

  console.log(result.text);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
