# Sistema de Memória

## Visão Geral

O Forge implementa um sistema de memória em duas camadas:

1. **Working Memory** — Memória operacional durante execução
2. **Long-Term Memory (LTM)** — Memória persistente com checkpointing

## Working Memory

Memória de curto prazo disponível durante a execução de um step.

```typescript
interface RuntimeWorkingMemory {
  messages: Array<RuntimeMessage>;      // Histórico de mensagens
  observations: Array<Observation>;     // Observações recentes
  reflections: Array<Reflection>;      // Reflexões do agente
  artifacts: Array<Artifact>;            // Artefatos gerados
}
```

### RuntimeMessage

```typescript
interface RuntimeMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

### Observation

```typescript
interface Observation {
  id: string;
  content: string;
  importance: number;         // 0-10
  timestamp: number;
  source: 'llm' | 'tool' | 'message';
}
```

### Reflection

```typescript
interface Reflection {
  id: string;
  content: string;
  summary: string;           // Versão resumida
  timestamp: number;
  relatedObservations: string[];
}
```

## Long-Term Memory (LTM)

Memória persistente que sobrevive entre sessões.

```typescript
interface AgentCheckpointedOmState {
  id: string;
  agentId: string;
  checkpointedOmTotalContextTokens: number;
  checkpointedOmRecentRawTokens: number;
  stateJson: string;           // Estado operacional serializado
  createdAt: number;
}
```

### Estrutura do LTM

```
Agent Long-Term Memory
├── operational-memory/       # Estado operacional
│   ├── memory.json          # Memória operacional
│   ├── reflections.json      # Reflexões
│   └── artifacts/           # Artefatos
├── recall/                   # Sistema de recall
│   └── index.ts             # Recuperação de memórias
└── checkpoints/              # Checkpoints salvos
    └── checkpoint-{timestamp}.json
```

## Checkpointing

O processo de salvar o estado operacional para memória persistente.

### Quando Checkpointar

```typescript
// Condições para checkpoint
const shouldCheckpoint = (
  state: RuntimeWorkingMemory,
  lastCheckpoint: number
): boolean => {
  // 1. Após mudanças significativas
  const hasSignificantChanges = 
    state.messages.length > lastMessageCount + 5 ||
    state.observations.length > lastObservationCount + 3;
  
  // 2. A cada N tokens consumidos
  const tokenBudget = getTokenBudget(config);
  const consumedTokens = getConsumedTokens(state);
  const tokenThreshold = consumedTokens >= tokenBudget * 0.8;
  
  // 3. Periodicamente (a cada 30 minutos)
  const timeThreshold = Date.now() - lastCheckpoint > 30 * 60 * 1000;
  
  return hasSignificantChanges || tokenThreshold || timeThreshold;
};
```

### Fluxo de Checkpoint

```
Execução procede
       │
       ▼
Estado muda significativamente?
       │
  ┌────┴────┐
  │         │
  Sim       Não
  │         │
  ▼         ▼
Checkpoint    Aguarda próximo
       │
       ▼
┌─────────────────────────────────────┐
│ Serializar Estado                    │
│ stateJson = JSON.stringify(state)   │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Salvar no Banco                      │
│ INSERT INTO agent_checkpointed_om_states
└─────────────────────────────────────┘
       │
       ▼
   Próxima execução
   carrega checkpoint
```

## Recall (Recuperação)

Sistema para recuperar memórias relevantes.

```typescript
// apps/forge/src/agents/agent-long-term-memory-recall.ts
interface MemoryRecallResult {
  memories: MemoryEntry[];
  relevance: number;           // 0-1
  totalTokens: number;
}

interface MemoryEntry {
  content: string;
  timestamp: number;
  source: string;
  relevanceScore: number;
}
```

### Estratégias de Recall

```typescript
// Por similaridade semântica
async function recallBySimilarity(
  query: string,
  limit: number = 10
): Promise<MemoryRecallResult> {
  // 1. Embed query
  const queryEmbedding = await embed(query);
  
  // 2. Buscar no banco vetorial
  const memories = await vectorSearch(queryEmbedding, { limit });
  
  // 3. Filtrar e rankear
  return memories
    .filter(m => m.relevance > 0.7)
    .sort((a, b) => b.relevance - a.relevance);
}

// Por timestamp (recente)
async function recallRecent(
  agentId: string,
  limit: number = 10
): Promise<MemoryRecallResult> {
  const memories = await db.select()
    .from(agentCheckpointedOmStates)
    .where(eq(agentCheckpointedOmStates.agentId, agentId))
    .orderBy(desc(agentCheckpointedOmStates.createdAt))
    .limit(limit);
  
  return { memories, relevance: 1.0 };
}

// Por keyword
async function recallByKeyword(
  agentId: string,
  keywords: string[],
  limit: number = 10
): Promise<MemoryRecallResult> {
  const memories = await db.select()
    .from(agentCheckpointedOmStates)
    .where(and(
      eq(agentCheckpointedOmStates.agentId, agentId),
      // keyword search in stateJson
    ))
    .limit(limit);
  
  return { memories, relevance: 0.8 };
}
```

## Configuração

### System Settings

```bash
# Configurar tokens do checkpoint
curl -X PUT http://localhost:3000/admin/system/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "checkpointing.om_recent_raw_tokens", "value": "5000"}'

# Configurar frequência de checkpoint
curl -X PUT http://localhost:3000/admin/system/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "checkpointing.interval_ms", "value": "1800000"}'
```

### Settings Disponíveis

| Key | Default | Descrição |
|-----|---------|-----------|
| `checkpointing.om_recent_raw_tokens` | 5000 | Tokens recentes no checkpoint |
| `checkpointing.max_context_tokens` | 100000 | Máximo de tokens no contexto |
| `checkpointing.interval_ms` | 1800000 | Intervalo de checkpoint (30 min) |

## Workspace Memory

O workspace também armazena arquivos de memória.

```
workspaces/{agentId}/
├── memory/
│   ├── documents/          # Documentos do agente
│   ├── notes/              # Notas
│   └── knowledge/          # Base de conhecimento
└── artifacts/              # Artefatos gerados
```

```typescript
// Salvar documento no workspace
async function saveMemoryDocument(
  agentId: string,
  document: MemoryDocument
): Promise<string> {
  const path = `workspaces/${agentId}/memory/documents/${document.id}.md`;
  await fs.writeFile(path, document.content);
  return path;
}

// Carregar documentos
async function loadMemoryDocuments(
  agentId: string
): Promise<MemoryDocument[]> {
  const path = `workspaces/${agentId}/memory/documents/`;
  const files = await fs.readdir(path);
  
  return Promise.all(
    files
      .filter(f => f.endsWith('.md'))
      .map(async f => ({
        id: f.replace('.md', ''),
        content: await fs.readFile(`${path}/${f}`, 'utf-8')
      }))
  );
}
```
