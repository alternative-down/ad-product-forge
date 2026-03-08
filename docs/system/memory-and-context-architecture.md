# Design de Contexto: Memória de Dois Níveis (V2)

Esta é a especificação técnica detalhada para a gestão de contexto utilizando o framework Mastra.ai, focada em threads únicas por agente e separação de preocupações entre logs de longo prazo e execução transiente.

## 1. Arquitetura de Contexto

### Nível 1: Thread Primária (Log de Eventos Consolidado)
- **Papel:** Identidade única e persistente do agente.
- **Estrutura:** 
    - `User Request` inicial da tarefa.
    - `Final Agent Response` após a conclusão.
    - **Observational Memory (OM):** Ativo para comprimir esse histórico em observações e reflexões.
- **Funcionamento:** Esta thread não executa iterações de ferramentas. Ela serve apenas como o "diário" do agente. Novas interações são salvas manualmente no fim de cada ciclo de execução.

### Nível 2: Thread de Execução (Transient Task Runtime)
- **Papel:** Workspace volátil para o cumprimento da tarefa.
- **Conteúdo:** Histórico bruto da execução atual (`tool-calls`, `tool-results`, erros, raciocínios intermediários).
- **Mecânica:** Criada via `cloneThread()` a partir da Primária.
- **Recursos Ativos:**
    - **Working Memory (WM):** Estado mutável para guiar a tarefa.
    - **Hybrid Recall Processor:** Injeção de contexto por passo (`processInputStep`).

---

## 2. Investigação Técnica (Comportamentos do Mastra)

Baseado na análise do código fonte (`@mastra/memory` e `@mastra/core`):

1.  **Clonagem de OM:** O método `cloneThread()` do Mastra **clona explicitamente** os registros de Observational Memory. Ele mapeia os IDs das mensagens observadas para a nova thread. Portanto, o Nível 2 herda todo o conhecimento comprimido do Nível 1.
2.  **Working Memory:** O WM é persistente no storage. Durante a clonagem, o estado atual do WM é associado à nova thread. Alterações no WM durante a execução do Nível 2 precisam ser sincronizadas de volta para a Thread Primária no encerramento do ciclo.
3.  **Gatilho programático do OM:** O OM pode ser acionado sem um `agent.generate`. A classe `ObservationalMemory` possui um método público `observe()`. Isso permite que a manutenção da Thread Primária seja feita de forma limpa, apenas "notificando" a memória sobre as novas mensagens salvas.

---

## 3. Implementação da Estratégia

### A. Sincronização de Working Memory
Como o WM é persistente, mas a thread de execução é deletada ao fim, a sincronização deve ocorrer no orquestrador:

```typescript
// No fim da execução:
const finalWM = await memory.getWorkingMemory({ threadId: execThread.id });
if (finalWM) {
  await memory.updateWorkingMemory({
    threadId: primaryThreadId,
    workingMemory: finalWM
  });
}
```

### B. Manutenção da Thread Primária (OM Manual)
Em vez de um `generate` extra, usamos o método `observe` para processar o novo par de mensagens:

```typescript
// Após salvar as mensagens na Primary Thread:
const omProcessor = await agent.resolveProcessorById('observational-memory');
if (omProcessor) {
  await omProcessor.observe({
    threadId: primaryThreadId,
    // Isso forçará a compressão se o limite de tokens for atingido
  });
}
```

### C. Hybrid Recall Processor (Mensagens + GraphRAG + FS)
Este processador atua em cada passo do loop no Nível 2:

1.  **Semantic Recall:** Busca mensagens relevantes no histórico (via `memory.recall`).
2.  **GraphRAG Ingestion:** As **Reflexões** geradas pelo OM na Thread Primária são enviadas para o Neo4j.
3.  **GraphRAG Query:** O processador consulta o Neo4j usando o embedding da última mensagem do usuário para recuperar relações semânticas.
4.  **Injeção:** Consolida tudo em um bloco `<memory>` injetado no `processInputStep`.

---

## 4. Fluxo do Orquestrador (Pseudo-código)

O fluxo ideal para garantir a separação de níveis:

1.  **Identificar Thread Primária** (Única por Agente).
2.  **Clonar para Execução:** `memory.cloneThread({ source: primaryId })`.
3.  **Rodar Tarefa (Nível 2):** `agent.generate(...)` com `HybridRecallProcessor`.
4.  **Consolidar Resposta:** Salvar Request/Response na `primaryId`.
5.  **Sincronizar WM:** Copiar estado final do WM da `execId` para `primaryId`.
6.  **Manutenção OM:** Chamar `om.observe({ threadId: primaryId })`.
7.  **Alimentar Grafo:** Se o OM gerou reflexão, indexar no Neo4j.
8.  **Cleanup:** Deletar `execId`.

---

## 5. Próximos Passos
- Implementar o `createAgent` na factory já configurando o `HybridRecallProcessor`.
- Criar a função `executeAutonomousCycle` que encapsula a lógica de orquestração acima.
- Integrar o driver Neo4j para o componente de GraphRAG.
