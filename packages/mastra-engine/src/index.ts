import { Agent, ToolsInput, MastraDBMessage } from '@mastra/core/agent';
import { AgentConfig } from '@mastra/core/agent';
import { Workspace, LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS } from '@mastra/core/workspace';
import { Memory } from '@mastra/memory';
import { SharedMemoryConfig } from '@mastra/core/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { fastembed } from '@mastra/fastembed';
import path from 'path';
import fs from 'fs';

export interface CreateAgentParams {
  id: string;
  name: string;
  instructions: string;
  model: AgentConfig['model'];
  workspacePath?: string;
  tools?: ToolsInput;
  agents?: Record<string, Agent>;
  // Overrides opcionais
  memory?: Memory;
  workspace?: Workspace;
  embedder?: SharedMemoryConfig['embedder'];
  maxSteps?: number;
}

export async function createAgent({
  id,
  name,
  instructions,
  model,
  workspacePath,
  tools: additionalTools,
  agents,
  memory: memoryOverride,
  workspace: workspaceOverride,
  embedder = fastembed,
  maxSteps = 1000,
}: CreateAgentParams): Promise<Agent> {
  const finalEmbedder = embedder;
  
  // Derivando caminhos e nomes do Agent ID
  const baseDir = workspacePath || `workspace_${id}`;
  const absolutePath = path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir);
  const dbUrl = `file:${path.join(absolutePath, `agent_${id}.db`)}`;

  // Ensure workspace directory exists
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }

  // 1. Configuração do Workspace (se houver path ou override)
  let finalWorkspace = workspaceOverride;
  if (!finalWorkspace) {
    finalWorkspace = new Workspace({
      filesystem: new LocalFilesystem({
        basePath: absolutePath,
      }),
      sandbox: new LocalSandbox({
        workingDirectory: absolutePath,
      }),
      bm25: true,
      vectorStore: new LibSQLVector({
        id: `${id}-workspace-vector`,
        url: `file:${path.join(absolutePath, `workspace_${id}.db`)}`,
      }),
      embedder: finalEmbedder,
      skills: ['/skills'],
      tools: {
        enabled: true,
        requireApproval: false,
        // Padronização de nomes sem o prefixo mastra_
        [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { name: 'read_file' },
        [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { name: 'write_file' },
        [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { name: 'edit_file' },
        [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: { name: 'list_files' },
        [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { name: 'delete_file' },
        [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: { name: 'file_stat' },
        [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { name: 'make_directory' },
        [WORKSPACE_TOOLS.FILESYSTEM.GREP]: { name: 'search_content' },
        [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: { name: 'ast_edit' },
        [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { name: 'execute_command' },
        [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: { name: 'get_process_output' },
        [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: { name: 'kill_process' },
        [WORKSPACE_TOOLS.SEARCH.SEARCH]: { name: 'search_workspace' },
        [WORKSPACE_TOOLS.SEARCH.INDEX]: { name: 'index_workspace' },
      },
    });

    await finalWorkspace.init();
  }

  // 2. Configuração da Memória (se não houver override)
  let finalMemory = memoryOverride;
  if (!finalMemory) {
    finalMemory = new Memory({
      storage: new LibSQLStore({
        id: `${id}-storage`,
        url: dbUrl,
      }),
      vector: new LibSQLVector({
        id: `${id}-vector`,
        url: dbUrl,
      }),
      embedder: finalEmbedder,
      options: {
        lastMessages: Number.MAX_SAFE_INTEGER,
        semanticRecall: {
          topK: 3,
          messageRange: 2,
        },
        workingMemory: {
          enabled: true,
          scope: 'thread', // Isolado por thread para permitir a sincronização manual entre elas
        },
        observationalMemory: {
          enabled: true,
          model: model,
        },
      },
    });
  }

  // 3. Instanciação do Agente
  const agent = new Agent({
    id,
    name,
    instructions,
    model,
    workspace: finalWorkspace,
    memory: finalMemory,
    tools: additionalTools,
    agents,
    defaultOptions: {
      maxSteps,
    },
  });

  return agent;
}

export interface ExecuteCycleParams {
  agent: Agent;
  userPrompt: string;
  resourceId?: string;
}

/**
 * Executa um ciclo autônomo garantindo que apenas o par Request/Response
 * seja persistido na Thread Primária, enquanto a execução real ocorre em uma thread isolada (clonada).
 * Sincroniza o Working Memory final da execução de volta para a Thread Primária.
 */
export async function executeAutonomousCycle({
  agent,
  userPrompt,
  resourceId = 'default-resource',
}: ExecuteCycleParams) {
  const memory = await agent.getMemory();
  if (!memory) {
    throw new Error('Agent memory is not initialized');
  }

  // Identificadores derivados do Agent ID
  const primaryThreadId = `primary_${agent.id}`;

  // Ensure the primary thread exists before cloning
  const existingThread = await memory.getThreadById({ threadId: primaryThreadId });
  if (!existingThread) {
    await memory.createThread({
      threadId: primaryThreadId,
      resourceId,
      title: `Primary Thread for ${agent.name}`,
    });
  }

  // 1. Setup do Nível 2 (Transient)
  const tempThreadId = `exec_${agent.id}_${Date.now()}`;
  
  const { thread: execThread } = await memory.cloneThread({
    sourceThreadId: primaryThreadId,
    newThreadId: tempThreadId,
    resourceId,
    title: `Execution: ${userPrompt.slice(0, 30)}...`,
  });

  console.log(`[Engine] Running execution on thread: ${execThread.id}`);

  // 2. Execução da Tarefa no Nível 2
  const result = await agent.generate(userPrompt, {
    memory: {
      resource: resourceId,
      thread: execThread.id,
    },
  });

  // 3. Consolidação no Nível 1 (Primary)
  const consolidatedMessages: MastraDBMessage[] = [
    {
      id: `user_${Date.now()}`,
      role: 'user',
      content: {
        format: 2,
        parts: [{ type: 'text', text: userPrompt }],
      },
      threadId: primaryThreadId,
      resourceId,
      createdAt: new Date(),
      type: 'text',
    },
    {
      id: `assistant_${Date.now()}`,
      role: 'assistant',
      content: {
        format: 2,
        parts: [{ type: 'text', text: result.text }],
      },
      threadId: primaryThreadId,
      resourceId,
      createdAt: new Date(),
      type: 'text',
    },
  ];

  await memory.saveMessages({ messages: consolidatedMessages });
  
  // 4. Sincronização de Estado (Working Memory)
  // Extraímos o WM final da thread de execução e atualizamos a thread primária
  const finalWM = await memory.getWorkingMemory({ 
    threadId: execThread.id,
    resourceId
  });

  if (finalWM) {
    await memory.updateWorkingMemory({
      threadId: primaryThreadId,
      resourceId,
      workingMemory: finalWM
    });
    console.log(`[Engine] Working Memory synchronized to primary thread.`);
  }

  console.log(`[Engine] Interaction consolidated to: ${primaryThreadId}`);

  return result;
}

export * from './tools/market-research';
