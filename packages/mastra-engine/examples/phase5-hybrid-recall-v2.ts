import dotenv from 'dotenv';
import { createAgent } from '../src';
import fs from 'fs';
import path from 'path';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

async function main() {
  if (!OPENROUTER_API_KEY) {
    console.log('⚠️ OPENROUTER_API_KEY is missing.');
    return;
  }

  const modelString = 'openrouter/arcee-ai/trinity-large-preview:free';
  const testWorkspace = path.join(process.cwd(), `workspace_proof_${Date.now()}`);
  
  if (!fs.existsSync(testWorkspace)) {
      fs.mkdirSync(testWorkspace, { recursive: true });
  }

  // Agente com contexto ZERADO na execução para provar o Recall
  const agent = await createAgent({
    id: 'orion-hybrid-proof',
    name: 'Orion Hybrid Proof Agent',
    instructions: 'You are a helpful assistant. Use the <context_injection> to answer.',
    model: modelString,
    workspacePath: testWorkspace,
    lastMessages: 0, 
    maxSteps: 3
  });

  const resourceId = 'proof-resource';

  console.log(`🚀 Starting Phase 5 V2 (Proof) Test...`);

  try {
    console.log("\n--- Turn 1: Memory Phase ---");
    await agent.generate("Olá! Grave isso: O código da fase 5 é 'ALFA-RECALL-99'.", {
        memory: { resource: resourceId }
    });
    
    console.log("\n--- Turn 2: Recall Phase ---");
    console.log("Com lastMessages=0, o agente só saberá o código se o HybridRecallProcessor injetar.");
    
    const result = await agent.generate("Qual é o código da fase 5 que te falei?", {
        memory: { resource: resourceId }
    });
    
    console.log(`\n🤖 Agent Response:\n${result.text}`);

    if (result.text.toUpperCase().includes("ALFA-RECALL-99")) {
        console.log("\n✅ SUCCESS: Fact recovered via Hybrid Recall Processor!");
    } else {
        console.log("\n❌ FAILURE: Fact not recovered.");
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error:', errorMessage);
  } finally {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
  }
}

main().catch(console.error);
