import { Agent, AgentConfig, ToolsInput, MastraDBMessage, AgentExecutionOptions, AgentExecutionOptionsBase, StructuredOutputOptions } from '@mastra/core/agent';
import { MessageListInput } from '@mastra/core/agent/message-list';
import { FullOutput } from '@mastra/core/stream';
import { Workspace, LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS } from '@mastra/core/workspace';
import { Memory } from '@mastra/memory';
import { ObservationalMemory } from '@mastra/memory/processors';
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

/**
 * Agente customizado que implementa a arquitetura de dois níveis de contexto.
 * Sobrescreve o método generate para gerenciar automaticamente a clonagem, 
 * consolidação e manutenção da memória de longo prazo.
 */
class EngineAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, any> | unknown = unknown,
> extends Agent<TAgentId, TTools, TOutput, TRequestContext> {
  private memoryInstance: Memory;
  private omProcessor: ObservationalMemory;
  private primaryThreadId: string;

  constructor(config: AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & { memoryInstance: Memory; omProcessor: ObservationalMemory }) {
    super(config);
    this.memoryInstance = config.memoryInstance;
    this.omProcessor = config.omProcessor;
    this.primaryThreadId = `primary_${this.id}`;
  }

  // Sobrecarga 1: Assinatura padrão
  override generate(messages: MessageListInput, options?: AgentExecutionOptions<TOutput>): Promise<FullOutput<TOutput>>;
  
  // Sobrecarga 2: Structured Output (OUTPUT extends {})
  override generate<OUTPUT extends {}>(messages: MessageListInput, options: AgentExecutionOptionsBase<OUTPUT> & {
      structuredOutput: StructuredOutputOptions<OUTPUT>;
  }): Promise<FullOutput<OUTPUT>>;
  
  // Sobrecarga 3: Genérica
  override generate<OUTPUT>(messages: MessageListInput, options?: AgentExecutionOptionsBase<any> & {
      structuredOutput?: StructuredOutputOptions<any>;
  }): Promise<FullOutput<OUTPUT>>;

  // Implementação única que lida com todas as sobrecargas
  override async generate(
    messages: MessageListInput,
    options?: any
  ): Promise<any> {
    const resourceId = options?.memory?.resource || 'default-resource';
    
    // 1. Garantir que a Thread Primária existe
    const existingThread = await this.memoryInstance.getThreadById({ threadId: this.primaryThreadId });
    if (!existingThread) {
      await this.memoryInstance.createThread({
        threadId: this.primaryThreadId,
        resourceId,
        title: `Primary Thread for ${this.name}`,
      });
    }

    // 2. Setup do Nível 2 (Transient) via Clonagem
    const execThreadId = `exec_${this.id}_${Date.now()}`;
    const { thread: execThread } = await this.memoryInstance.cloneThread({
      sourceThreadId: this.primaryThreadId,
      newThreadId: execThreadId,
      resourceId,
      title: `Execution: ${JSON.stringify(messages).slice(0, 30)}...`,
    });

    // 3. Execução Real na thread clonada
    const result = await super.generate(messages, {
      ...options,
      memory: {
        ...options?.memory,
        resource: resourceId,
        thread: execThread.id,
      }
    });

    // 4. Consolidação na Thread Primária (Request/Response apenas)
    const userPrompt = typeof messages === 'string' ? messages : JSON.stringify(messages);
    const consolidatedMessages: MastraDBMessage[] = [
      {
        id: `user-${Date.now()}-cons`,
        role: 'user',
        content: {
          format: 2,
          parts: [{ type: 'text', text: userPrompt }],
        },
        threadId: this.primaryThreadId,
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
        threadId: this.primaryThreadId,
        resourceId,
        createdAt: new Date(),
        type: 'text',
      },
    ];

    await this.memoryInstance.saveMessages({ messages: consolidatedMessages });

    // 5. Sincronização de Working Memory
    const finalWM = await this.memoryInstance.getWorkingMemory({ 
      threadId: execThread.id,
      resourceId
    });

    if (finalWM) {
      await this.memoryInstance.updateWorkingMemory({
        threadId: this.primaryThreadId,
        resourceId,
        workingMemory: finalWM
      });
    }

    // 6. Manutenção Manual do OM na Thread Primária
    await this.omProcessor.observe({
      threadId: this.primaryThreadId,
      resourceId,
    });

    return result;
  }
}

/**
 * Factory para criar um agente Mastra com arquitetura de dois níveis de contexto.
 * Retorna uma instância do tipo Agent (Mastra) com comportamento de EngineAgent.
 */
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
  const baseDir = workspacePath || `workspace_${id}`;
  const absolutePath = path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir);
  const dbUrl = `file:${path.join(absolutePath, `agent_${id}.db`)}`;

  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }

  // 1. Configuração de Storage e OM
  const storage = new LibSQLStore({
    id: `${id}-storage`,
    url: dbUrl,
  });

  const omProcessor = new ObservationalMemory({
    storage: storage.stores.memory,
    model: model as any,
    scope: 'thread',
    observation: {
      messageTokens: 500,
    },
    reflection: {
      observationTokens: 1000,
    }
  });

  // 2. Configuração do Workspace
  let finalWorkspace = workspaceOverride;
  if (!finalWorkspace) {
    const workspaceEmbedder = async (text: string): Promise<number[]> => {
      const result = await fastembed.embed({ values: [text] });
      return result.embeddings[0] || [];
    };

    finalWorkspace = new Workspace({
      filesystem: new LocalFilesystem({ basePath: absolutePath }),
      sandbox: new LocalSandbox({ workingDirectory: absolutePath }),
      bm25: true,
      vectorStore: new LibSQLVector({
        id: `${id}-workspace-vector`,
        url: `file:${path.join(absolutePath, `workspace_${id}.db`)}`,
      }),
      embedder: workspaceEmbedder,
      skills: ['/skills'],
      tools: {
        enabled: true,
        requireApproval: false,
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

  // 3. Configuração da Memória
  let finalMemory = memoryOverride;
  if (!finalMemory) {
    finalMemory = new Memory({
      storage,
      vector: new LibSQLVector({ id: `${id}-vector`, url: dbUrl }),
      embedder: embedder as any,
      options: {
        lastMessages: Number.MAX_SAFE_INTEGER,
        semanticRecall: { topK: 3, messageRange: 2 },
        workingMemory: { enabled: true, scope: 'thread' },
      },
    });
  }

  // 4. Criação do EngineAgent
  const agent = new EngineAgent({
    id,
    name,
    instructions,
    model,
    workspace: finalWorkspace,
    memory: finalMemory,
    memoryInstance: finalMemory,
    omProcessor: omProcessor,
    tools: additionalTools,
    agents,
    inputProcessors: [omProcessor],
    outputProcessors: [omProcessor],
    defaultOptions: {
      maxSteps,
    },
  });

  return agent as Agent;
}

export * from './tools/market-research';
