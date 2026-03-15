# Design de Contexto: Memória de Dois Níveis (V4 - GraphRAG Ingestion)

Este documento detalha como o **Mastra Engine** implementa a memória através de múltiplas camadas: observações (OM), workspace local (Workspace) e busca semântica (GraphRAG via LibSQLVector).

## 1. Estratégia de Ingestão Unificada

O sistema de memória do Mastra é implementado com um índice vetorial em `LibSQLVector` como a base de conhecimento central ("Cérebro") do agente. GraphRAG utiliza este índice para construir relações e recuperação semântica.

### 1.1 Fontes de Dados

| Fonte | Momento da Ingestão | Descrição |
| :--- | :--- | :--- |
| **OM Reflections** | Pós-Ciclo de Geração | Toda reflexão gerada pelo OM (seja na Primary ou na ExecThread) é capturada, chunkada e indexada. |
| **Workspace Files** | Inicialização / Update | Arquivos do diretório `./workspace` são processados pelo `MDocument` e enviados ao `knowledge_index`. |
| **Consolidated Messages** | Pós-Ciclo de Geração | O par Request/Response final da Thread Primária é indexado para recall semântico imediato via grafo. |

---

## 2. Fluxo de Reflexões (As duas Threads?)

**Sim.** Embora a Thread Primária seja o log oficial, tarefas muito longas podem disparar reflexões (compressão) dentro da Thread de Execução (Nível 2).

- **Thread de Execução:** Captura o "como" a tarefa foi feita (detalhes técnicos, erros superados).
- **Thread Primária:** Captura o "o que" foi feito (resultado final e intenção do usuário).

O orquestrador agora verifica e ingere observações de **ambas** as threads ao final de cada ciclo.

---

## 3. Implementação Técnica da Ingestão

### 3.1 Componente `GraphIntegrator`
O integrador agora possui métodos para diferentes tipos de dados:

```typescript
export class GraphIntegrator {
  // Ingestão de blocos de texto (Reflexões/Mensagens)
  async ingestText(text: string, metadata: any);
  
  // Ingestão recursiva de arquivos do Workspace
  async ingestWorkspace(workspace: Workspace);
}
```

### 3.2 Ciclo de Vida no `EngineAgent`

```typescript
override async generate(...) {
  // ... execução ...
  
  // 1. Ingestão da Thread de Execução (Transient Knowledge)
  const execObs = await this.omProcessor.getObservations(execThreadId);
  await this.integrator.ingestText(execObs, { scope: 'execution' });

  // 2. Consolidação e Ingestão da Primary Thread (Identity Knowledge)
  await this.omProcessor.observe({ threadId: primaryId });
  const primaryObs = await this.omProcessor.getObservations(primaryId);
  await this.integrator.ingestText(primaryObs, { scope: 'primary' });
}
```

---

## 4. Diferença entre Store e Graph

- **Store (LibSQL DB):** Armazena as mensagens brutas para o `lastMessages` e o estado exato do `WorkingMemory`.
- **Graph Index (LibSQL Vector):** Armazena as "partículas" de conhecimento (chunks) que o Mastra conecta via similaridade para o GraphRAG.

A busca híbrida no `HybridRecallProcessor` agora consulta o `knowledge_index` usando a ferramenta de GraphRAG, permitindo que o agente "navegue" entre uma reflexão de 3 dias atrás e um arquivo de configuração recém-criado.

## 5. Status Atual
- [x] LongTermMemory processor implementado com suporte a Workspace e busca semântica.
- [x] Integração com ObservationalMemory e GraphRAG via LibSQLVector.
- [x] Busca híbrida (workspace + graph) funcionando na LongTermMemory.
