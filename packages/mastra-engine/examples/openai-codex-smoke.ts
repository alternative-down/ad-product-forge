import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';

import { createOpenAICodexGateway, openaiCodexProvider } from '../src/llm/openai-codex';

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
    model: openaiCodexProvider('gpt-5.4'),
  });
  const mastra = new Mastra({
    agents: { [String(agent.id)]: agent },
    gateways: { openaiCodexOauth: createOpenAICodexGateway() },
  });

  const result = await mastra.getAgent(String(agent.id))!.generate('Responda exatamente com: ok', {
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
