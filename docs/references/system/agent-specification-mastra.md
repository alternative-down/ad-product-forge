# Especificação Técnica: Agente Individual

## Visão Geral

Um agente é criado via `createForgeAgent()` e é totalmente gerenciado pelo runtime. Este documento descreve a estrutura interna e comportamento de execução de um agente.

## 1. Identidade e Configuração

```typescript
{
  id: string              // Identificador único (usado para thread, thread de memória, etc)
  name: string            // Nome do agente
  description: string     // Descrição do papel/responsabilidade
  instructions: string    // Prompt do sistema para o modelo LLM
  model: AgentConfig['model']  // Modelo LLM (ex: Claude, OpenAI)
  tools?: ToolsInput      // Ferramentas TypeScript tipadas
  workflows?: Workflow[]  // Workflows complexos (estado/passos determinísticos)
  workspace?: Workspace   // Workspace do Mastra (para operações de arquivo/ambiente)
  agents?: Agent[]        // Referência a outros agentes para delegação
  providers?: CommunicationProvider[]  // Provedores de comunicação (email, Discord, etc)
}
```

**Pessoa**: Cada agente tem um nome, email e papel que definem sua função no sistema. Um agente é um "funcionário" autônomo.

## 2. Armazenamento e Memória

Cada agente possui três bancos de dados isolados:

### 2.1 Base de Dados Principal (`{agentId}.db`)

LibSQL (SQLite) com as seguintes stores:

- **memory**: Armazena observações curtas do ObservationalMemory
- **communication**: Mensagens inbound/outbound, contatos, conversas (de provedores de comunicação)
- **thread**: Histórico de mensagens da thread principal do agente

**Acesso via**: `createAgentStorage(agentId)`

### 2.2 Base de Dados de Memória de Longo Prazo (`{agentId}-memory-workspace.db`)

LibSQLVector (SQLite com extensão de vetores) para busca híbrida.

Criado e gerenciado pela classe `LongTermMemory` quando a opção `longTermMemory: true` é usada. O arquivo de banco é `{agentId}-memory-workspace.db`, enquanto o identificador interno do vetor armazenado é `{agentId}-memory-workspace-vector`.

### 2.3 Workspace de Memória

Diretório local: `.forge-memory/{agentId}/`

Armazena observações em arquivos Markdown organizados por data:

- `observations/2024-03-15.md` — observações do dia
- `observations/2024-03-16.md` — próximo dia
- etc.

Cada observação é indexada para busca híbrida (vetorial + BM25).

## 3. Modelos de Memória

### 3.1 Memória de Trabalho (Working Memory)

**Escopo**: Injetada no início de cada step de execução

**Fonte**: Template em `WORKING_MEMORY_TEMPLATE`, renderizado automaticamente

**Propósito**: Dar ao agente visibilidade do estado atual: quem sou, que contexto estou, qual é a tarefa

**Implementação**: Mastra's `Memory` class com `workingMemory.enabled = true`

### 3.2 Memória Observacional (Observational Memory)

**Escopo**: Coletada durante a execução e persistida por thread

**Config**:

```typescript
{
  observation: { messageTokens: 15000 },    // Limite de tokens por observação
  reflection: { observationTokens: 20000 }  // Limite de tokens por reflexão
}
```

**Fluxo**:

1. Durante execução, o LLM gera observações sobre o que aprendeu
2. Observações são armazenadas no banco de dados de memória
3. Reflections são geradas automaticamente sobre conjuntos de observações

**Implementação**: `ObservationalMemory` do Mastra

### 3.3 Memória de Longo Prazo (Long-Term Memory) — Opcional

**Ativação**: Apenas se `options.longTermMemory = true` em `createAgent()`

**Fluxo Automático**:

1. **Input Step**: Antes de cada step, LongTermMemory injeta memória relevante
   - Busca híbrida por similaridade vetorial + BM25 fulltext no workspace
   - Também consulta grafo de conhecimento via GraphRAG
   - Resultados injetados como `Recovered past memory...`

2. **Output Step**: Após cada step, observações novas são:
   - Lidas do ObservationalMemory
   - Organizadas por dia em `observations/{YYYY-MM-DD}.md`
   - Indexadas no workspace (vetorial + BM25)

**Armazenamento de Vetores**: FastEmbed para embeddings, LibSQLVector para índice

**Busca**: Top-K = 3 resultados mais relevantes por método

## 4. Ciclo de Execução

### 4.1 Acionamento

Jobs chegam na fila do agente via:

- `agent.generate()` — chamada direta do código
- `communication.onReceiveMessage()` — mensagens de provedores de comunicação
- Wake queue — debounce 1s, máx 10s entre notificações

### 4.2 Processadores (Input/Output)

Aplicados automaticamente a cada step:

```
[ObservationalMemory] + [LongTermMemory (se ativado)] → Gera observações
                  ↓
           Agent executa step
                  ↓
[ObservationalMemory] + [LongTermMemory (se ativado)] → Persiste memória
```

### 4.3 Histórico de Mensagens

Cada execução começa com a thread clonada (se disponível) para evitar contaminação entre runs.

Ao final do run, apenas é devolvido o resumo executivo para a thread principal.

### 4.4 Operações Suportadas

Uma execução pode invocar:

- **Tools**: Funções TypeScript tipadas para trabalhar com dados/APIs
- **Workflows**: Fluxos determinísticos com estado definido
- **Agentes delegados**: Chamar outro agente e esperar resultado
- **Comunicação**: Enviar mensagens via provedores registrados

## 5. Comunicação com Provedores Externos

### 5.1 Módulo de Comunicação

Criado em `createCommunicationModule({ client, providers })`, gerencia:

- **Contatos**: Síncronos e armazenados por provider
- **Mensagens**: Inbound (da rede para o agente) e outbound (do agente para a rede)
- **Conversas**: Histórico persistido por provider e contact
- **Callbacks**: `onReceiveMessage` dispara wake queue quando novas mensagens chegam

### 5.2 Ferramentas de Comunicação

Injetadas automaticamente em todos os agentes:

```typescript
sendMessage(input: { provider: string; conversationId?: string; contactSlug?: string; content: string; replyToMessageId?: string; })
listContacts()
getContact(slug: string)
upsertContact(input: { slug: string; displayName: string; description?: string })
listConversations(input: { provider?: string; contactSlug?: string; unread?: boolean; limit: number })
getMessages(input: { conversationId: string; limit: number })
```

### 5.3 Ciclo de Vida de uma Mensagem Inbound

1. Provedor recebe mensagem da rede
2. `onMessage` callback sincroniza contato (cria ou atualiza)
3. Mensagem é salva no banco de comunicação
4. `receiveMessageHandler` é chamado (wake queue)
5. Agente acorda com `Pending external activity detected...` prompt
6. Agente verifica `listConversations` e processa mensagens

## 6. Funções Principais

### 6.1 `createAgent(config, options)`

Cria um agente com memória observacional (sempre) e opcionalmente memória de longo prazo.

**Retorna**: `Agent` do Mastra totalmente configurado e pronto para execução.

### 6.2 `createForgeAgent(config)`

Atalho para `createAgent(config, { longTermMemory: true })`.

Recomendado para a maioria dos agentes.

### 6.3 `agent.generate(prompt, { memory, maxSteps, ... })`

Executa um prompt no agente.

**Argumentos**:

- `prompt`: String com instruções/tarefa
- `memory.thread`: ID da thread para contexto
- `memory.resource`: ID do recurso associado (para queries de memória)
- `maxSteps`: Limite de passos de execução (padrão: ilimitado)

**Retorna**: Resultado da execução com histórico de steps.

## 7. Fluxo de Criação

```typescript
import { createForgeAgent } from '@mastra/engine';

const agent = await createForgeAgent({
  id: 'research-agent',
  name: 'Research Specialist',
  description: 'Pesquisa e sintetiza informações de múltiplas fontes',
  instructions: 'You are a research agent...',
  model: { name: 'claude-3-5-sonnet-20241022' },
  tools: {
    /* custom tools */
  },
  providers: [
    /* communication providers */
  ],
});

await agent.generate('Start daily research cycle', {
  memory: { thread: 'research-agent', resource: 'research-agent' },
  maxSteps: 1000,
});
```

## 8. Arquivos de Referência

- `packages/mastra-engine/src/create-forge-agent.ts` — Função principal de criação
- `packages/mastra-engine/src/agent/memory/` — Implementações de memória
- `packages/mastra-engine/src/agent/communication/` — Módulo de comunicação
- `packages/mastra-engine/src/agent/wake-queue.ts` — Debounce de eventos externos
