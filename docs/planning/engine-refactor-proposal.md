# Proposta de Refatoração: Engine-Mastra (Orion & Kael)

Após uma rodada de brainstorming entre **Orion** e **Kael**, identificamos os pontos de atrito no motor atual e desenhamos uma arquitetura mais robusta e simples, focada em desacoplamento e Type Safety total.

## 1. Diagnóstico da Estrutura Atual (Problemas)

- **Acoplamento Forte:** O `EngineAgent` instancia o `GraphIntegrator` internamente, forçando o uso de `fastembed` e castings `as any`.
- **Inconsistência de Embedders:** O sistema gerencia o embedder em 3 lugares diferentes, aumentando o risco de dessincronização entre memória e grafo.
- **Recall Frágil:** O `HybridRecallProcessor` manipula strings XML manualmente para injetar contexto, o que foge dos padrões de `Processors` do Mastra e é difícil de manter.
- **Ingestão Redundante:** Não há controle de de-duplicação ou versionamento na ingestão de arquivos e reflexões.

---

## 2. Arquitetura Alvo (The "Clean" Way)

### A. Dependency Injection (DI) & Interfaces
Substituiremos as instâncias hardcoded por uma configuração de dependências injetadas. O `EngineAgent` passará a depender da interface `IKnowledgeGraph`, tornando-o agnóstico à implementação do RAG.

```typescript
interface IKnowledgeGraph {
  ingest(content: string, metadata: IngestMetadata): Promise<void>;
  query(query: string, options?: QueryOptions): Promise<GraphResult>;
}
```

### B. Unificação do Lifecycle de Conhecimento
Criaremos o `KnowledgeManager`, um serviço único para gerenciar:
1. **Bootstrap:** Ingestão inicial do Workspace.
2. **Dynamic Update:** Ingestão de reflexões do OM em tempo real.
3. **De-duplication:** Garantir que o mesmo conhecimento não seja vetorizado repetidamente.

### C. Hybrid Recall via Context Builder
O processador deixará de injetar mensagens de sistema manualmente. Ele utilizará o pattern de `contextBuilder` do Mastra para expor os dados recuperados (Mensagens, Workspace e Grafo) de forma estruturada.

---

## 3. Plano de Implementação Incremental (Refatorado)

### Fase 1: Abstração e Type Safety (The Foundation)
- [ ] Criar interface `IKnowledgeGraph`.
- [ ] Refatorar `GraphIntegrator` para `GraphRAGAdapter` (implementando a interface).
- [ ] Unificar a gestão do `Embedder` na factory, propagando a mesma instância para todos os componentes.
- [ ] **Meta:** 0 castings `as any` no motor.

### Fase 2: Desacoplamento do Agente (DI Pattern)
- [ ] Refatorar o constructor do `EngineAgent` para receber as dependências prontas.
- [ ] Remover lógicas de inicialização de dentro do `generate`.
- [ ] Integrar o `EngineAgent` com a interface do grafo.

### Fase 3: Reformulação do Hybrid Recall
- [ ] Refatorar o `HybridRecallProcessor` para remover a concatenação manual de XML.
- [ ] Implementar a separação entre lógica de busca e lógica de injeção.

### Fase 4: Knowledge Manager & De-duplication
- [ ] Implementar o `KnowledgeManager` para orquestrar o lifecycle de dados.
- [ ] Adicionar suporte a ignore patterns no scanner do workspace.

---

## 4. Próximos Passos
O Kael está com a análise detalhada e o plano de ação pronto. Se aprovado, iniciaremos a **Fase 1** imediatamente.

**Documento de Referência:** `/data/workspace/kael/engine-mastra-refactor-analysis.md` (by Kael)
