import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';

import { CLAUDE_MAX_MODELS } from '../src/llm/model-ids';
import { createOAuthGateway, OAUTH_GATEWAY_ID } from '../src/llm/oauth-gateway';

async function main() {
  const agent = new Agent({
    id: 'claude-max-smoke',
    name: 'Claude Max Smoke',
    instructions: 'Responda de forma curta e direta.',
    model: `${OAUTH_GATEWAY_ID}/claude-max/${CLAUDE_MAX_MODELS[0]}`,
  });
  const mastra = new Mastra({
    agents: { [String(agent.id)]: agent },
    gateways: { oauth: createOAuthGateway() },
  });

  const result = await mastra.getAgent(String(agent.id))!.generate('Responda exatamente com: ok');

  console.log(result.text);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
