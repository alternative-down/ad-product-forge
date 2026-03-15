import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';

import { OPENAI_CODEX_MODELS } from '../src/llm/model-ids';
import { createOAuthGateway, OAUTH_GATEWAY_ID } from '../src/llm/oauth-gateway';

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
    model: `${OAUTH_GATEWAY_ID}/openai-codex/${OPENAI_CODEX_MODELS[0]}`,
  });
  const mastra = new Mastra({
    agents: { [String(agent.id)]: agent },
    gateways: { oauth: createOAuthGateway() },
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
