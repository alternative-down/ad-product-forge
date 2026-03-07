import dotenv from 'dotenv';
import { createAgent, marketResearchTool } from '../src';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

async function main() {
  if (!OPENROUTER_API_KEY && process.env.NODE_ENV === 'production') {
    throw new Error('❌ OPENROUTER_API_KEY is required in production');
  }

  if (!OPENROUTER_API_KEY) {
    console.log('⚠️ Skipping message test because OPENROUTER_API_KEY is missing.');
    return;
  }

  const modelString = 'openrouter/arcee-ai/trinity-large-preview:free';

  // Usando a Factory do pacote para criar o agente com a nova tool de Firecrawl
  const agent = await createAgent({
    id: 'research-agent',
    name: 'Research Agent',
    instructions: 'You are a market research specialist. Use the market_research tool to find opportunities.',
    model: modelString,
    workspacePath: 'workspace_research',
    tools: {
      market_research: marketResearchTool,
    },
  });

  const threadId = `research-thread-${Date.now()}`;
  const resourceId = 'research-resource';

  console.log(`🚀 Starting research conversation on thread: ${threadId}`);

  try {
    const result = await agent.generate('Please search for 3 market signals about AI in healthcare.', {
      memory: {
        resource: resourceId,
        thread: threadId
      }
    });
    console.log(`🤖 Agent: ${result.text}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error during example execution:', errorMessage);
  }
}

main();
