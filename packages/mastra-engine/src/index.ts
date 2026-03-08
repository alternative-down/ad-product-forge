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
  const dbPath = workspacePath ? `file:${path.join(workspacePath, 'agent.db')}` : 'file:agent.db';

  // Ensure workspace directory exists if provided
  if (workspacePath) {
    const absolutePath = path.isAbsolute(workspacePath) ? workspacePath : path.join(process.cwd(), workspacePath);
    if (!fs.existsSync(absolutePath)) {
      fs.mkdirSync(absolutePath, { recursive: true });
    }
  }

  // 1. Configuração do Workspace (se houver path ou override)
  let finalWorkspace = workspaceOverride;
  if (!finalWorkspace && workspacePath) {
    const absolutePath = path.isAbsolute(workspacePath) ? workspacePath : path.join(process.cwd(), workspacePath);

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
        url: `file:${path.join(absolutePath, 'workspace.db')}`,
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
        url: dbPath,
      }),
      vector: new LibSQLVector({
        id: `${id}-vector`,
        url: dbPath,
      }),
      embedder: finalEmbedder,
      options: {
        lastMessages: Number.MAX_SAFE_INTEGER, // Mantém todo o histórico até que o OM comprima
        semanticRecall: {
          topK: 3,
          messageRange: 2,
        },
        workingMemory: {
          enabled: true,
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
  primaryThreadId: string;
  userPrompt: string;
  resourceId?: string;
}

/**
 * Executa um ciclo autônomo garantindo que apenas o par Request/Response
 * seja persistido na Thread Primária, enquanto a execução real ocorre em uma thread isolada (clonada).
 */
export async function executeAutonomousCycle({
  agent,
  primaryThreadId,
  userPrompt,
  resourceId = 'default-resource',
}: ExecuteCycleParams) {
  const memory = await agent.getMemory();
  if (!memory) {
    throw new Error('Agent memory is not initialized');
  }

  // Ensure the primary thread exists before cloning
  const existingThread = await memory.getThreadById({ threadId: primaryThreadId });
  if (!existingThread) {
    await memory.saveThread({
      thread: {
        id: primaryThreadId,
        title: 'Primary Thread', // Title is mandatory in LibSQL store
        resourceId,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      }
    });
  }

  // 1. Setup do Nível 2 (Transient)
  // Criamos uma thread de execução isolada (Nível 2) clonando o estado atual da thread primária.
  // Isso herda todo o histórico comprimido (OM) e o estado atual do Working Memory.
  const tempThreadId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const { thread: execThread } = await memory.cloneThread({
    sourceThreadId: primaryThreadId,
    newThreadId: tempThreadId,
    resourceId,
    title: `Execution Thread: ${primaryThreadId}`,
  });

  console.log(`[Engine] Created execution thread: ${execThread.id} (Cloned from ${primaryThreadId})`);

  // 2. Execução da Tarefa no Nível 2
  const result = await agent.generate(userPrompt, {
    memory: {
      resource: resourceId,
      thread: execThread.id,
    },
  });

  // 3. Consolidação no Nível 1 (Primary)
  // Salvamos apenas o par Request (User) e Response (Final Assistant) na thread principal.
  const consolidatedMessages: MastraDBMessage[] = [
    {
      id: `user-${Date.now()}-cons`,
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
      id: `assistant-${Date.now()}-cons`,
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
  console.log(`[Engine] Consolidated Request/Response to primary thread: ${primaryThreadId}`);

  // 4. Cleanup (Remover Thread Transiente)
  // Deletamos a thread de execução para não poluir o banco de dados com tool-calls e iterações.
  await memory.deleteThread(execThread.id);
  console.log(`[Engine] Cleaned up execution thread: ${execThread.id}`);

  return result;
}

export * from './tools/market-research';
