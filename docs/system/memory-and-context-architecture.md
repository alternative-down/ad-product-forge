# Design de Contexto: Memória de Dois Níveis (Primary vs. Execution)

Este documento descreve a arquitetura técnica para gestão de contexto de longo prazo e execução transiente utilizando o framework Mastra.ai.

## 1. Visão Geral dos Níveis

Para manter o agente eficiente e com memória infinita, separamos o contexto em duas esferas:

### Nível 1: Thread Primária (Long-term Identity)
*   **Papel:** Representa a identidade única do agente e sua história consolidada.
*   **Conteúdo:** Apenas o par `User Request` <-> `Final Response`.
*   **Gestão de Contexto:** **Observational Memory (OM)** ativo.
*   **Funcionamento:** O OM observa as mensagens e, ao atingir o limite de tokens, substitui o histórico bruto por **Observações** e **Reflexões** densas. As mensagens originais permanecem no banco de dados, mas são filtradas pelo processador durante a injeção de contexto.

### Nível 2: Thread de Execução (Transient Task)
*   **Papel:** Ambiente de trabalho "sujo" onde o agente executa múltiplas iterações, tool-calls e raciocínio intermediário.
*   **Conteúdo:** Histórico completo da tarefa, logs de ferramentas e erros.
*   **Herança:** Criada via `cloneThread()` a partir da Primária.
*   **Recall:** **Hybrid Recall Processor** ativo por passo (`processInputStep`), injetando dados de:
    *   Mensagens passadas (Semantic Recall).
    *   Base de Conhecimento (GraphRAG alimentado pelo OM).
    *   Workspace Filesystem (Busca Híbrida).

---

## 2. Descobertas Técnicas (Investigação do Source)

Após investigar o código fonte do Mastra (`@mastra/memory`), confirmamos os seguintes comportamentos:

1.  **OM e Clonagem:** O método `cloneThread()` do Mastra possui lógica explícita para clonar registros de Observational Memory. Ele usa `remapObservationalMemoryRecord` para mapear IDs de mensagens e threads antigas para os novos clones. Portanto, **o contexto do OM é preservado na thread de execução.**
2.  **Working Memory:** O WM é persistente e é copiado durante a clonagem. Se o agente atualizar o WM na thread de execução, precisaremos sincronizar esse valor de volta para a Primária se quisermos que a mudança seja permanente.
3.  **Gatilho do OM:** O OM é acionado principalmente pelos hooks `processInput` e `processOutputResult` dos agentes. Para que ele rode na Thread Primária (que não executa ferramentas), podemos disparar uma chamada de "manutenção" (generate de resumo) ou chamar o método de observação da memória diretamente via código.

---

## 3. Fluxo de Execução (Pseudo-código Válido)

Abaixo, a estrutura de como o orquestrador (ou Workflow) deve gerenciar esse ciclo:

```typescript
async function runAutonomousTask(agent, primaryThreadId, userPrompt) {
  const memory = await agent.getMemory();

  // 1. Setup do Nível 2 (Transient)
  // Clona a thread primária (herda OM e mensagens filtradas)
  const { thread: execThread } = await memory.cloneThread({
    sourceThreadId: primaryThreadId,
    newThreadId: `exec-${Date.now()}`,
  });

  // 2. Execução com Recall Híbrido e WM
  // O agente terá acesso ao Workspace e GraphRAG a cada passo
  const runResult = await agent.generate(userPrompt, {
    threadId: execThread.id,
    memory: {
      options: {
        workingMemory: { enabled: true },
        semanticRecall: true, // Para buscar mensagens no histórico da thread de execução
      }
    },
    // Injeta conhecimento externo (GraphRAG + FS) por passo
    inputProcessors: [new HybridRecallProcessor()] 
  });

  // 3. Consolidação no Nível 1 (Primary)
  // Salvamos apenas o Input e o Output final
  await memory.saveMessages({
    messages: [
      { role: 'user', content: userPrompt, threadId: primaryThreadId },
      { role: 'assistant', content: runResult.text, threadId: primaryThreadId }
    ]
  });

  // 4. Manutenção de Memória (Trigger OM)
  // Fazemos uma chamada leve na Primary para forçar o OM a observar o novo par
  // Isso gera as observações que alimentarão o GraphRAG
  await agent.generate("Summarize latest interaction for your long-term memory.", {
    threadId: primaryThreadId,
    memory: { options: { observationalMemory: true } },
    maxSteps: 1 // Execução mínima
  });

  // 5. Cleanup
  await memory.deleteThread(execThread.id);

  return runResult.text;
}
```

---

## 4. Integração GraphRAG

O **GraphRAG** será alimentado de forma assíncrona:
*   Sempre que o OM gerar uma nova **Reflexão (Reflection)** na Thread Primária, o conteúdo dessa reflexão é enviado para o grafo Neo4j.
*   Isso transforma o log linear de observações em uma rede de relacionamentos semânticos que o `HybridRecallProcessor` consulta a cada passo da execução.

## 5. Próximos Passos de Implementação
1.  Desenvolver o `HybridRecallProcessor` no pacote `@mastra-engine/core`.
2.  Implementar a lógica de sincronização do `WorkingMemory` entre threads.
3.  Criar o wrapper de orquestração que automatiza o ciclo `Clone -> Exec -> Sync -> OM Trigger`.
