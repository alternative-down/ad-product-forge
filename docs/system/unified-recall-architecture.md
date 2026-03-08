# Arquitetura: Unified Step-wise Recall (Nova Versão Simplificada)

Após revisão técnica e brainstorming, decidimos abandonar a arquitetura de dois níveis (Primary/Execution) em favor de uma solução nativa baseada em **Processadores Unificados** e **Filtros de Contexto**.

## 1. O Conceito Central

Em vez de gerenciar a complexidade de clonagem e sincronização de threads, utilizaremos um único processador que potencializa o `SemanticRecall` nativo do Mastra para rodar em cada passo da execução.

### Principais Pilares:
- **Thread Única:** O agente opera em apenas uma thread, simplificando a persistência e a identidade.
- **UnifiedRecallProcessor:** Um processador customizado que encapsula o `SemanticRecall` e estende sua funcionalidade para Workspace e GraphRAG.
- **Isolamento via Filtros:** Utilizaremos `FilterToolCalls` ou processadores de filtragem para manter a janela de contexto limpa, exibindo apenas o necessário para o modelo sem poluir o histórico de longo prazo.

---

## 2. Funcionamento do `UnifiedRecallProcessor`

Este processador implementará a interface `Processor` e gerenciará três fontes de conhecimento de forma síncrona com o ciclo de vida do agente:

### A. Integração com SemanticRecall
O processador instanciará internamente o `SemanticRecall` do Mastra. No hook `processInputStep`, ele delegará a busca de mensagens passadas para este componente oficial, garantindo estabilidade e uso correto dos tipos do Mastra.

### B. Expansão de Contexto (Workspace & Grafo)
Além das mensagens, o processador consultará:
1.  **Workspace Store:** Busca híbrida nos arquivos locais.
2.  **GraphRAG Store:** Busca de conexões semânticas no índice de conhecimento.

### C. Injeção Cache-Aware
O resultado consolidado será injetado na lista de mensagens respeitando a eficiência de cache, inserindo os dados recuperados logo antes da última mensagem do step.

---

## 3. Fluxo Simplificado

1.  **Início do Step:** O Mastra chama `UnifiedRecallProcessor.processInputStep()`.
2.  **Recall:** 
    *   `SemanticRecall` busca mensagens passadas.
    *   Busca paralela no Workspace e no Grafo.
3.  **Consolidação:** Um bloco de contexto Markdown é montado.
4.  **Injeção:** O bloco é inserido no histórico transiente do step.
5.  **Geração:** O modelo responde com todo o conhecimento necessário.

---

## 4. Vantagens da Abordagem

- **Performance:** Menos chamadas de banco de dados (sem clone/delete thread).
- **Simplicidade de Código:** Removemos a subclasse `EngineAgent` e a lógica de sincronização manual de `WorkingMemory`.
- **Nativo:** Trabalha *com* o Mastra e não *em volta* dele.
- **Custo:** Proteção total do cache de prefixo (Prompt Caching).

---

## 5. Próximos Passos (Implementação)

- [ ] Criar o `UnifiedRecallProcessor` no `@mastra-engine/core`.
- [ ] Configurar o `createAgent` para injetar este processador e o `FilterToolCalls`.
- [ ] Validar a recuperação de contexto em thread única.
