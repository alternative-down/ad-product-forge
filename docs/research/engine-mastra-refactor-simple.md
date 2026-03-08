# Engine-Mastra: Refactoring Simplificado (V2)

Após o brainstorming com o Nicolas, refizemos a proposta de refatoração focando em **simplicidade** e **eficiência de cache**.

## 1. Solução Técnica: Cache-Aware Injection

O principal problema da proposta anterior era o uso de `contextBuilder`, que injeta dados no início do prompt, invalidando o cache a cada step.

**Nova Estratégia:** O `HybridRecallProcessor` agora injeta o contexto como uma mensagem de sistema **logo antes da última mensagem** da lista.
- **Resultado:** O histórico anterior permanece estático (cache hit), e o novo conhecimento é adicionado dinamicamente apenas para o passo atual.

## 2. Unificação do Embedder (Zero Casting)

Para resolver a bagunça de embedders duplicados e o uso de `as any`:
- O `Embedder` é definido uma única vez na factory.
- Ele é propagado para a `Memory` e para o `GraphIntegrator` via Dependency Injection (DI).
- Isso garante que o grafo e a memória sempre falem a mesma "língua" vetorial.

## 3. Recall Híbrido "Limpo"

Substituímos a manipulação frágil de XML por um fluxo estruturado:
- **Markdown:** O contexto injetado agora é formatado como Markdown limpo.
- **Estrutura:** O processador constrói um objeto `ContextData` e delega a formatação para um método privado.
- **Real-time:** Continua extraindo contexto de ToolCalls e ToolResults em cada iteração do loop.

---

## Plano de Implementação (Refatorado)

### Fase 1: Fundação DI e Embedder Único
- [ ] Refatorar a factory `createAgent` para definir o embedder no topo.
- [ ] Injetar o embedder consistentemente em todos os componentes.
- [ ] **Meta:** Eliminar todos os castings `as any` da inicialização.

### Fase 2: Hybrid Recall Cache-Aware
- [ ] Refatorar o `HybridRecallProcessor` para implementar o padrão de injeção *antes da última mensagem*.
- [ ] Migrar de XML para Markdown na formatação do contexto.

### Fase 3: Integração do GraphRAG no Motor
- [ ] Refatorar o `EngineAgent` para receber o `GraphIntegrator` já instanciado.
- [ ] Implementar a query de grafo real dentro do processador híbrido.

---

**Resumo da Simplificação:**
- ❌ Sem interfaces `IKnowledgeGraph`.
- ❌ Sem `contextBuilder` nativo do Mastra.
- ❌ Sem Managers de lifecycle complexos.
- ✅ Foco total em DI simples e proteção do Prompt Cache.
