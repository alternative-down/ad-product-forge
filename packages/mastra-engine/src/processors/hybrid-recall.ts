import { MastraDBMessage, MastraMessagePart } from '@mastra/core/agent';
import { ProcessInputStepArgs, Processor } from '@mastra/core/processors';
import { Workspace } from '@mastra/core/workspace';
import { Memory } from '@mastra/memory';

interface TextPart {
  type: 'text';
  text: string;
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
    
    // Só processamos se houver uma mensagem de usuário para usar como query
    if (!lastMessage || lastMessage.role !== 'user') {
      return allMessages;
    }

    const queryText = typeof lastMessage.content === 'string' 
      ? lastMessage.content 
      : this.extractText(lastMessage.content.parts || []);

    if (!queryText) {
      return allMessages;
    }

    const threadId = messageList.serialize().memoryInfo?.threadId;
    const resourceId = messageList.serialize().memoryInfo?.resourceId;

    console.log(`[HybridRecall] Querying context for: "${queryText.slice(0, 50)}..."`);

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

    // Injetamos a memória antes da última mensagem do usuário para dar contexto ao LLM
    const newMessages = [...allMessages];
    newMessages.splice(newMessages.length - 1, 0, systemInjection);

    return newMessages;
  }
}
