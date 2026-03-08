import dotenv from 'dotenv';
import { createAgent, executeAutonomousCycle } from '../src';

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

  const agent = await createAgent({
    id: 'orion-wm',
    name: 'Orion WM Agent',
    instructions: 'You are a helpful assistant. Always use your working memory to store important user facts.',
    model: modelString,
    workspacePath: 'workspace_wm_test',
  });

  console.log(`🚀 Starting Phase 3 (WM Sync) Test for Agent: ${agent.id}`);

  try {
    console.log("\n--- Turn 1: Learning a fact ---");
    const result = await executeAutonomousCycle({
      agent,
      userPrompt: "Olá! Meu nome é Nicolas e eu sou um desenvolvedor de software. Salve isso na sua working memory.",
    });
    
    console.log(`🤖 Agent response: ${result.text}`);
    
    console.log("\n--- Turn 2: Verifying WM persistence in a new execution thread ---");
    const result2 = await executeAutonomousCycle({
      agent,
      userPrompt: "O que você sabe sobre mim baseando-se na sua working memory?",
    });
    
    console.log(`🤖 Agent response: ${result2.text}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error during WM sync test:', errorMessage);
  }
}

main().catch(console.error);
