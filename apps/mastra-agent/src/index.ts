import { Agent } from '@mastra/core/agent';
import dotenv from 'dotenv';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.warn('⚠️ OPENROUTER_API_KEY not set. Run with the key provided by Nicolas.');
}

const agent = new Agent({
  id: 'simple-agent',
  name: 'Simple Agent',
  instructions: 'You are a helpful assistant.',
  model: {
    providerId: 'openai',
    modelId: 'anthropic/claude-3.5-sonnet',
    url: 'https://openrouter.ai/api/v1',
    apiKey: OPENROUTER_API_KEY,
  },
});

async function main() {
  if (!OPENROUTER_API_KEY) {
    console.log('Skipping message test because API key is missing.');
    return;
  }

  console.log('🚀 Sending test message to Simple Agent...');
  try {
    const result = await agent.generate('Hello! Briefly introduce yourself.');
    console.log('🤖 Agent response:');
    console.log(result.text);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error testing agent:', errorMessage);
  }
}

main();
