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
  const workspacePath = 'workspace_hybrid_test';
  const absoluteWorkspacePath = path.join(process.cwd(), workspacePath);

  const agent = await createAgent({
    id: 'orion-hybrid',
    name: 'Orion Hybrid Agent',
    instructions: 'You are a helpful assistant with advanced recall capabilities. Use the injected context to answer accurately.',
    model: modelString,
    workspacePath: workspacePath,
  });

  console.log(`🚀 Starting Phase 5 (Hybrid Recall) Test for Agent: ${agent.id}`);

  try {
    // 1. Preparar o Workspace com um fato único
    if (!fs.existsSync(absoluteWorkspacePath)) {
        fs.mkdirSync(absoluteWorkspacePath, { recursive: true });
    }
    const secretFilePath = path.join(absoluteWorkspacePath, 'secret_knowledge.txt');
    fs.writeFileSync(secretFilePath, 'O código secreto da operação Mastra é: NEON-TURTLE-2026.');
    
    // Inicializar indexação do workspace (precisamos que o Mastra indexe os arquivos)
    console.log("[Test] Indexing workspace files...");
    await agent.workspace?.index(secretFilePath, 'O código secreto da operação Mastra é: NEON-TURTLE-2026.');

    console.log("\n--- Turn 1: Personal Fact ---");
    await agent.generate("Olá! Meu animal favorito é o Pinguim Imperial. Salve isso na sua memória.");
    
    console.log("\n--- Turn 2: Hybrid Challenge ---");
    console.log("Challenge: O agente deve recuperar o animal favorito (Memória) e o código secreto (Workspace).");
    
    const result = await agent.generate("Oi! Pode me dizer qual é o meu animal favorito e qual é o código secreto da operação Mastra que está nos arquivos do workspace?");
    
    console.log(`\n🤖 Agent Response:\n${result.text}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error during Hybrid Recall test:', errorMessage);
  }
}

main().catch(console.error);
