import { MastraDBMessage, MastraMessagePart } from '@mastra/core/agent';
import { ProcessInputStepArgs, Processor } from '@mastra/core/processors';
import { Workspace } from '@mastra/core/workspace';
import { Memory } from '@mastra/memory';

interface TextPart {
  type: 'text';
  text: string;
}

interface ToolCallPart {
  type: 'tool-call';
  toolName: string;
  args: any;
}

interface ToolResultPart {
  type: 'tool-result';
  toolName: string;
  result: any;
}

export class HybridRecallProcessor implements Processor<'hybrid-recall'> {
  readonly id = 'hybrid-recall';
  readonly name = 'Hybrid Recall Processor';
  readonly description = 'Injects semantic context from message history, workspace files, and knowledge graph.';

  private memoryInstance: Memory;
  private workspace: Workspace;

  constructor({ memory, workspace }: { memory: Memory; workspace: Workspace }) {
    this.memoryInstance = memory;
    this.workspace = workspace;
  }

  private extractQueryContext(message: MastraDBMessage): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    const parts = message.content.parts || [];
    let query = '';

    // Prioridade 1: Conteúdo de Texto (User ou Assistant reasoning)
    const textParts = parts.filter((p): p is TextPart => p.type === 'text');
    if (textParts.length > 0) {
      query += textParts.map(p => p.text).join(' ');
    }

    // Prioridade 2: Argumentos de Tool Calls (Assistant chamando ferramenta)
    const toolCallParts = parts.filter((p): p is ToolCallPart => p.type === 'tool-call');
    if (toolCallParts.length > 0) {
      query += ' ' + toolCallParts.map(p => 
        `${p.toolName} ${JSON.stringify(p.args)}`
      ).join(' ');
    }

    // Prioridade 3: Resultados de Ferramentas (Role tool)
    const toolResultParts = parts.filter((p): p is ToolResultPart => p.type === 'tool-result');
    if (toolResultParts.length > 0) {
      query += ' ' + toolResultParts.map(p => 
        `${p.toolName} result: ${JSON.stringify(p.result)}`
      ).join(' ');
    }

    return query.trim();
  }

  private extractText(parts: MastraMessagePart[]): string {
    return parts
      .filter((p): p is TextPart => p.type === 'text')
      .map(p => p.text)
      .join(' ');
  }

  async processInputStep({
    messageList,
  }: ProcessInputStepArgs): Promise<MastraDBMessage[]> {
    const allMessages = messageList.get.all.db();
    const lastMessage = allMessages[allMessages.length - 1];
    
    if (!lastMessage) {
      return allMessages;
    }

    // Agora extraímos contexto de QUALQUER tipo de mensagem (User, Assistant/ToolCall, ToolResult)
    const queryText = this.extractQueryContext(lastMessage);

    if (!queryText) {
      return allMessages;
    }

    const threadId = messageList.serialize().memoryInfo?.threadId;
    const resourceId = messageList.serialize().memoryInfo?.resourceId;

    console.log(`[HybridRecall] Querying context for step (role=${lastMessage.role}): "${queryText.slice(0, 50)}..."`);

    // 1. Semantic Message Recall (Mensagens Passadas)
    let messageContext = '';
    try {
      const recallResult = await this.memoryInstance.recall({
        threadId: threadId || '',
        resourceId,
        vectorSearchString: queryText,
        perPage: 3, // Pegamos os 3 trechos mais relevantes
      });
      
      if (recallResult.messages.length > 0) {
        messageContext = recallResult.messages
          .map(m => `[${m.role}]: ${this.extractText(m.content.parts || [])}`)
          .join('\n');
      }
    } catch (e) {
      console.error('[HybridRecall] Message recall failed:', e);
    }

    // 2. Workspace Search (Arquivos Locais)
    let workspaceContext = '';
    try {
      const searchResults = await this.workspace.search(queryText, {
        topK: 3,
        mode: 'hybrid'
      });

      if (searchResults.length > 0) {
        workspaceContext = searchResults
          .map(r => `File: ${r.id} (Score: ${r.score.toFixed(2)})\nContent: ${r.content}`)
          .join('\n---\n');
      }
    } catch (e) {
      console.warn('[HybridRecall] Workspace search failed (index might be empty):', e);
    }

    // 3. GraphRAG Facts (Placeholder para Fase 6)
    const graphContext = 'No semantic relations found in graph yet (Phase 6 pending).';

    // 4. Injeção do Bloco de Memória
    const memoryBlock = `
<context_injection>
  <step_context role="${lastMessage.role}" type="${lastMessage.type}">
    Query derived from: ${queryText.slice(0, 100)}...
  </step_context>

  <past_conversations_recall>
${messageContext || 'No relevant past messages found.'}
  </past_conversations_recall>
  
  <workspace_files_search>
${workspaceContext || 'No relevant workspace files found.'}
  </workspace_files_search>
  
  <graph_semantic_relations>
${graphContext}
  </graph_semantic_relations>
</context_injection>`;

    // Criamos a mensagem de sistema para injeção
    const systemInjection: MastraDBMessage = {
      id: `recall-${Date.now()}`,
      role: 'system',
      createdAt: new Date(),
      threadId,
      resourceId,
      content: {
        format: 2,
        parts: [{ type: 'text', text: memoryBlock }]
      }
    };

    // Injetamos a memória antes da última mensagem para dar contexto ao LLM sobre o passo atual
    const newMessages = [...allMessages];
    newMessages.splice(newMessages.length - 1, 0, systemInjection);

    return newMessages;
  }
}
