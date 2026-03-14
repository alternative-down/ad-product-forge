import { Agent } from '@mastra/core/agent';

import { claudeMaxProvider } from '../src/llm/claude-max';

async function main() {
  const agent = new Agent({
    id: 'claude-max-smoke',
    name: 'Claude Max Smoke',
    instructions: 'Responda de forma curta e direta.',
    model: claudeMaxProvider('claude-3-5-haiku-latest'),
  });

  const result = await agent.generate('Responda exatamente com: ok');

  console.log(result.text);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
