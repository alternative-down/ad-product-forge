import dotenv from 'dotenv';
import { createAgent, executeAutonomousCycle } from '../src';
import { ObservationalMemory } from '@mastra/memory/processors';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

async function main() {
  if (!OPENROUTER_API_KEY) {
    console.log('⚠️ OPENROUTER_API_KEY is missing.');
    return;
  }

  const modelString = 'openrouter/arcee-ai/trinity-large-preview:free';

  const agent = await createAgent({
    id: 'orion-om',
    name: 'Orion OM Agent',
    instructions: 'You are a helpful assistant. Provide long and detailed responses to help reach token thresholds.',
    model: modelString,
    workspacePath: 'workspace_om_test',
  });

  const resourceId = 'om-test-resource';

  console.log(`🚀 Starting Phase 4 (OM Maintenance) Test for Agent: ${agent.id}`);

  try {
    const prompts = [
      "Olá! Sou o Nicolas. Me conte detalhadamente sobre a história da inteligência artificial, desde Turing até os LLMs modernos.",
      "Agora explique como o framework Mastra ajuda na construção de agentes autônomos, detalhando cada componente.",
      "Baseado no que conversamos, resuma quem eu sou e quais foram os principais tópicos técnicos que discutimos até agora."
    ];

    for (const [index, p] of prompts.entries()) {
      console.log(`\n--- Turn ${index + 1} ---`);
      const result = await executeAutonomousCycle({
        agent,
        userPrompt: p,
        resourceId
      });
      
      console.log(`🤖 Agent response length: ${result.text.length} chars`);
    }

    // Após os turnos, vamos verificar se o OM gerou observações
    const omProcessor = (await agent.resolveProcessorById('observational-memory')) as ObservationalMemory;
    
    if (omProcessor) {
      const primaryThreadId = `primary_${agent.id}`;
      const observations = await omProcessor.getObservations(primaryThreadId, resourceId);
      
      console.log("\n--- Final Long-term Memory (OM) Check ---");
      if (observations) {
        console.log("✅ Observations found in Primary Thread:");
        console.log(observations);
      } else {
        console.log("ℹ️ No observations generated yet (Threshold probably not reached).");
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error during OM maintenance test:', errorMessage);
  }
}

main().catch(console.error);
