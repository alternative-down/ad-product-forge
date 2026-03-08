# Engine-Mastra Refactoring Analysis

## Problemas Identificados (Root Causes)

### 1. **Acoplamento Excessivo EngineAgent ↔ GraphIntegrator**

**Localização:** `index.ts:EngineAgent.generate()`

```typescript
// ❌ Problema: hardcoded, castings, tight coupling
this.integrator = new GraphIntegrator({
  vectorStore: this.memoryInstance.vector as any,  // ← casting desnecessário
  embedder: fastembed,                             // ← hardcoded, não vem da config
});
```

**Por que é ruim:**
- GraphIntegrator sempre recebe `fastembed` mesmo que a Memory use outro embedder.
- O constructor do EngineAgent não valida se `memoryInstance.vector` é realmente uma `MastraVector`.
- Castings `as any` mascaram type safety.
- Impossível substituir GraphIntegrator por uma alternativa (ex: LangChain Graph, Custom RAG).

---

### 2. **Embedder é Passado de 3 Formas Diferentes**

**Localização:** `index.ts` (múltiplos places)

```typescript
// Forma 1: Via createAgent params (fastembed como default)
const embedder = embedder || fastembed;

// Forma 2: Hardcoded em GraphIntegrator
embedder: fastembed  // ← sempre igual, ignorando param de cima

// Forma 3: Assumido em Memory via LibSQLVector
embedder: embedder as any  // ← casting, confiança na herança
```

**Por que é ruim:**
- Se alguém passa embedder customizado em `CreateAgentParams`, é ignorado em GraphIntegrator.
- Não há garantia de consistência (Memory + Graph usam o mesmo embedder?).
- Difícil debugar: qual embedder está sendo usado onde?

---

### 3. **HybridRecallProcessor Não é um Processor Legítimo**

**Localização:** `processors/hybrid-recall.ts:HybridRecallProcessor.processInputStep()`

```typescript
// ❌ Problema: injeta um <context_injection> XML manualmente
const memoryBlock = `
<context_injection>
  <past_conversations_recall>...
  ...
</context_injection>`;

const systemInjection: MastraDBMessage = {
  role: 'system',
  content: { parts: [{ type: 'text', text: memoryBlock }] }
};

newMessages.splice(newMessages.length - 1, 0, systemInjection);
```

**Por que é ruim:**
- XML inline é frágil (fácil de quebrar com parsing).
- Injetar message de `system` pode conflitar com outras processors que esperam formato específico.
- O `processInputStep` não implementa fully o contrato `Processor<'hybrid-recall'>`.
- Não há tracking de quando/como o contexto foi injetado.

---

### 4. **Dois Fluxos de Ingestão (Conflitantes)**

**Localização:** `index.ts:createAgent()`

```typescript
// Fluxo 1: Workspace ingestão inicial (única vez)
const initialIntegrator = new GraphIntegrator({...});
await initialIntegrator.ingestWorkspace(finalWorkspace);

// Fluxo 2: OM Reflection ingestão (por step, em EngineAgent.generate())
const execObs = await this.omProcessor.getObservations(execThread.id, resourceId);
if (execObs) {
  await this.integrator.ingestText(execObs, { source: 'execution_reflection', ... });
}
```

**Por que é ruim:**
- Não há de-duplication (mesmo arquivo pode ser ingerido múltiplas vezes).
- Workspace ingestão é hardcoded para root `/`, não respeita ignore patterns.
- Não há separação clara entre "static knowledge" (workspace) e "dynamic knowledge" (reflexões).
- GraphIntegrator não sabe se está lidando com arquivo novo ou versão atualizada.

---

### 5. **GraphIntegrator Faz Chunking Interno**

**Localização:** `graph/integrator.ts:ingestText()`

```typescript
const chunks = await doc.chunk({
  strategy: 'recursive',
  maxSize: 512,
  overlap: 50,
});
```

**Por que é ruim:**
- Hardcoded chunk strategy (recursive, 512, 50% overlap).
- Sem configuração externa, difícil otimizar para diferentes tipos de dados.
- Não há histórico de versão (quando um arquivo muda, qual versão fica no índice?).

---

## Arquitetura Proposta (Limpa)

### Princípio: Separação de Responsabilidades

```
┌─────────────────────────────────────────────────┐
│              EngineAgent (Principal)            │
│                                                 │
│  - Orquestra threads (Primary + Execution)     │
│  - Delega memória/graph/workspace para outros   │
│  - NÃO conhece detalhes de implementação       │
└──────────────┬──────────────────────────────────┘
               │
       ┌───────┼────────┬──────────────┬──────────┐
       │       │        │              │          │
    ┌──▼─┐ ┌──▼─┐  ┌──▼──┐  ┌──────▼─┐  ┌────▼───┐
    │    │ │    │  │     │  │        │  │        │
  Memory Graph Workspace OM  Token  Hybrid
                         Limiter  Recall
```

---

### Solução 1: Dependency Injection (DI) Pattern

**Nova Interface:**

```typescript
interface EngineConfig {
  id: string;
  name: string;
  instructions: string;
  model: AgentConfig['model'];
  
  // Instâncias externas (para DI + flexibility)
  memory: Memory;
  graph: GraphRAGInterface;      // ← abstração, não concreção
  workspace: Workspace;
  omProcessor: ObservationalMemory;
  tokenLimiter: TokenLimiterProcessor;
  hybridRecall: HybridRecallProcessor;
  
  // Configuração (opcional)
  maxSteps?: number;
}

class EngineAgent extends Agent {
  constructor(config: EngineConfig) {
    super({...});
    this.memory = config.memory;
    this.graph = config.graph;      // ← injected, testável
    this.workspace = config.workspace;
    // ...
  }

  override async generate(messages, options) {
    // ... manage threads, clone, sync ...
    
    // Usar this.graph (abstração) em vez de criar nova instância
    const reflections = await this.omProcessor.getObservations(...);
    await this.graph.ingestReflections(reflections, metadata);
    
    return result;
  }
}
```

**Factory Simplificado:**

```typescript
export async function createEngineAgent(params: CreateAgentParams): Promise<Agent> {
  // Setup memoria, graph, workspace, OM em paralelo
  const [memory, workspace, omProcessor] = await Promise.all([
    setupMemory(params),
    setupWorkspace(params),
    setupOM(params),
  ]);

  // Criar graph com embedder consistente
  const graph = new GraphRAGAdapter({
    vectorStore: memory.vector,
    embedder: memory.embedder,  // ← SEMPRE usa o mesmo
    chunker: new RecursiveChunker(params.chunkConfig),
  });

  // Pre-ingest workspace
  await graph.ingestWorkspace(workspace, { strategy: 'initial' });

  // Hybrid Recall
  const hybridRecall = new HybridRecallProcessor({
    memory,
    workspace,
    graph,
  });

  // EngineAgent
  return new EngineAgent({
    id: params.id,
    name: params.name,
    instructions: params.instructions,
    model: params.model,
    memory,
    graph,
    workspace,
    omProcessor,
    hybridRecall,
  });
}
```

---

### Solução 2: Abstraction Layer para Graph

**Antes (concreto, tight coupling):**

```typescript
class EngineAgent {
  integrator: GraphIntegrator;  // ← tight coupling a implementação
}
```

**Depois (abstrato, flexível):**

```typescript
interface IKnowledgeGraph {
  ingestText(text: string, metadata: Record<string, any>): Promise<void>;
  ingestWorkspace(workspace: Workspace, opts?: IngestOptions): Promise<void>;
  ingestReflections(text: string, metadata: Record<string, any>): Promise<void>;
  query(queryText: string, options?: QueryOptions): Promise<GraphQueryResult>;
}

class GraphRAGAdapter implements IKnowledgeGraph {
  // implementação concreta de GraphIntegrator refatorada
}

class EngineAgent {
  graph: IKnowledgeGraph;  // ← abstração, testável, swappable
}
```

**Vantagens:**
- Trocar implementação (GraphRAG ↔ LangChain ↔ Custom) sem mexer EngineAgent.
- Mock em testes.
- Adicionar decorators (logging, caching) facilmente.

---

### Solução 3: HybridRecallProcessor como Context Builder (Clean)

**Antes (injeta XML manualmente):**

```typescript
async processInputStep({ messageList }) {
  // ... recall logics ...
  
  const memoryBlock = `<context_injection>...</context_injection>`;
  const systemInjection = { role: 'system', content: { text: memoryBlock } };
  
  newMessages.splice(newMessages.length - 1, 0, systemInjection);
  return newMessages;
}
```

**Depois (constrói context object, delega formatação):**

```typescript
class HybridRecallProcessor implements Processor {
  async processInputStep({ messageList, contextBuilder }) {
    const queryText = this.extractQuery(lastMessage);
    
    const context = await this.buildContext(queryText);
    // context = { past_conversations, workspace_files, graph_relations }
    
    // Usar contextBuilder (provided by Mastra) em vez de string manualmente
    await contextBuilder.addContext('semantic_recall', context.past_conversations);
    await contextBuilder.addContext('workspace_search', context.workspace_files);
    await contextBuilder.addContext('graph_relations', context.graph_relations);
    
    return messageList;  // contextBuilder injeta automaticamente
  }

  private async buildContext(queryText: string) {
    return {
      past_conversations: await this.recall(queryText),
      workspace_files: await this.workspace.search(queryText),
      graph_relations: await this.graph.query(queryText),
    };
  }
}
```

**Vantagens:**
- Sem manipulação manual de XML/messages.
- Mastra cuida de formatação + injeção.
- Mais testável, menos frágil.

---

### Solução 4: KnowledgeGraph Lifecycle Manager

**Novo serviço:**

```typescript
interface IngestStrategy {
  name: string;
  apply(workspace: Workspace): AsyncIterable<IngestBatch>;
}

class WorkspaceIngestStrategy implements IngestStrategy {
  constructor(opts?: { ignorePatterns?: string[] }) {}
  
  async *apply(workspace: Workspace) {
    // Yield batches de arquivos, respeitando ignore patterns
    for await (const batch of this.scanWorkspace(workspace)) {
      yield batch;
    }
  }
}

class OMReflectionIngestStrategy implements IngestStrategy {
  constructor(omProcessor: ObservationalMemory) {}
  
  async *apply(workspace: Workspace) {
    // Não iterates workspace, espera por updates via feed
    // Usado em EngineAgent.generate() após OM processing
  }
}

class KnowledgeGraphManager {
  constructor(
    private graph: IKnowledgeGraph,
    private strategies: Record<string, IngestStrategy>
  ) {}

  async bootstrap(workspace: Workspace) {
    // Initial ingest (uma vez)
    for await (const batch of this.strategies.initial.apply(workspace)) {
      await this.graph.ingestBatch(batch);
    }
  }

  async ingestReflections(reflections: string, metadata: any) {
    // Dynamic ingest (per step)
    await this.graph.ingestText(reflections, metadata);
  }
}
```

---

## Checklist de Refatoração

- [ ] **1. Extrair abstração `IKnowledgeGraph`**
  - Arquivo: `graph/interface.ts`
  - Implementar: `GraphRAGAdapter` (refactor de GraphIntegrator)

- [ ] **2. Refactor `EngineAgent` para usar DI**
  - Remover inicialização hardcoded (GraphIntegrator, fastembed)
  - Receber dependências via constructor

- [ ] **3. Refactor `createAgent()` factory**
  - Setup paralelo (memory, workspace, OM)
  - Criar graph com embedder consistente
  - Passar todas as dependências ao EngineAgent

- [ ] **4. Refactor `HybridRecallProcessor`**
  - Remover string concatenation manual
  - Usar contextBuilder pattern
  - Separar build logic de injection

- [ ] **5. Introduzir `KnowledgeGraphManager`**
  - Gerenciar lifecycle de ingestão
  - Support múltiplas estratégias
  - De-duplication

- [ ] **6. Testes**
  - Mock `IKnowledgeGraph` em testes unitários
  - E2E com GraphRAGAdapter real

---

## Impacto

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Linhas de acoplamento** | 5+ (hardcoded) | 0 (injected) |
| **Testabilidade** | Difícil (mocks complexos) | Fácil (DI + interfaces) |
| **Flexibilidade** | Fixa (GraphIntegrator) | Flexível (qualquer IKnowledgeGraph) |
| **Embedder consistency** | Manual tracking | Automático (via Memory) |
| **Context injection** | Frágil (XML manual) | Robusto (contextBuilder) |
| **Maintenance** | Alto | Baixo |

---

## Próximos Passos

1. **Refactor fase 1:** Abstrair GraphIntegrator → IKnowledgeGraph + GraphRAGAdapter.
2. **Refactor fase 2:** DI no EngineAgent.
3. **Refactor fase 3:** HybridRecallProcessor + KnowledgeGraphManager.
4. **Tests:** Suite completa com mocks.
5. **Integração:** Validar com ad-product-forge workflow.
