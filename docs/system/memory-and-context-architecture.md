# Design de Contexto: Memória de Dois Níveis (V4 - GraphRAG Ingestion)

Este documento detalha como o **Mastra Engine** popula o GraphRAG com dados provenientes de múltiplas fontes (OM, Workspace e Mensagens).

## 1. Estratégia de Ingestão Unificada

O GraphRAG nativo do Mastra requer um índice vetorial rico para construir as relações. Utilizaremos o índice `knowledge_index` no `LibSQLVector` como a base de conhecimento central ("Cérebro") do agente.

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

## 5. Próximos Passos
- [ ] Atualizar `GraphIntegrator` com suporte a Workspace e Dedeplicação básica.
- [ ] Implementar ingestão dupla (Primary + Exec) no `EngineAgent`.
- [ ] Validar se o `HybridRecallProcessor` consegue relacionar dados das duas fontes.
