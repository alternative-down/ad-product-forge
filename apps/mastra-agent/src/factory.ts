import { Agent } from '@mastra/core/agent';
import { Workspace, LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS } from '@mastra/core/workspace';
import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { fastembed } from '@mastra/fastembed';
import path from 'path';
import { AgentConfig, ToolsInput } from '@mastra/core/agent';

export interface CreateAgentParams {
  id: string;
  name: string;
  instructions: string;
  model: string | any;
  workspacePath?: string;
  tools?: ToolsInput;
  agents?: Record<string, Agent>;
  // Overrides opcionais
  memory?: Memory;
  workspace?: Workspace;
  embedder?: any;
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
        lastMessages: 10,
        semanticRecall: {
          topK: 3,
          messageRange: 2,
        },
        workingMemory: {
          enabled: true,
        },
        observationalMemory: {
          enabled: true,
          model: typeof model === 'string' ? model : model.modelId,
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
