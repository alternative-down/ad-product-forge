import { Agent } from '@mastra/core/agent';

import { claudeMaxProvider } from '../src/providers/claude-max';

async function main() {
  const agent = new Agent({
    id: 'claude-max-smoke',
    name: 'Claude Max Smoke',
    instructions: 'Responda de forma curta e direta.',
    model: claudeMaxProvider('claude-sonnet-4-6'),
  });

  const result = await agent.generate('Responda exatamente com: ok');

  console.log(result.text);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
