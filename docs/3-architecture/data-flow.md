# Fluxo de Dados

## Fluxo Principal

### 1. Inicialização

```
Variáveis de Ambiente
       ↓
main.ts (entry point)
       ↓
┌──────────────────────────────────────┐
│         Inicialização                 │
│  ├── getInternalAgentRegistry()      │
│  ├── createAgentContractStore()      │
│  ├── createCapabilityStore()         │
│  ├── createAgentEmailManager()       │
│  └── createAgentScheduleManager()    │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│         Carregar Agentes              │
│  └── registry.loadAll()              │
│       ├── Ler agentes do DB          │
│       ├── Descriptografar credentials │
│       └── Carregar providers          │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│         Iniciar Execução              │
│  └── registry.runAll()               │
│       ├── Criar timers               │
│       └── Disparo inicial            │
└──────────────────────────────────────┘
```

### 2. Execução de Step

```
Scheduler (timer expira)
       ↓
AgentRunner.nextStep()
       ↓
┌──────────────────────────────────────┐
│         Carregar Contexto             │
│  ├── Carregar LTM (checkpoint)       │
│  ├── Carregar providers              │
│  └── Preparar working memory          │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│         LLM Generate                  │
│  ├── Montar prompt                   │
│  ├── Enviar para LLM                 │
│  └── Receber resposta                │
└──────────────────────────────────────┘
       ↓
         ┌──────────────────────────────────────┐
         │         Interpretar Resposta          │
         │  ├── Se text → preparar resposta     │
         │  ├── Se tool_call → verificar perm   │
         │  └── Se done → finalizar step        │
         └──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│         Executar Tool (se necessário)│
│  ├── Verificar permission           │
│  ├── Validar input com schema        │
│  ├── Executar handler                │
│  └── Retornar resultado              │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│         Atualizar Estado              │
│  ├── Update LTM (checkpoint)         │
│  ├── Notificar providers             │
│  └── Log step no banco               │
└──────────────────────────────────────┘
```

### 3. Comunicação Recebida

```
Mensagem Recebida (Discord/Email/Chat)
       ↓
Provider processa mensagem
       ↓
┌──────────────────────────────────────┐
│         Filtros                       │
│  ├── Bot messages? discard           │
│  ├── Channels configured? discard     │
│  ├── Mentions (se requerido)? discard│
│  └── Echo (2 min TTL)? discard       │
└──────────────────────────────────────┘
       ↓
AgentRunner.processInbound()
       ↓
Agent processa e gera resposta
       ↓
Provider.sendMessage()
       ↓
Resposta enviada
```

## Fluxo de Dados por Componente

### AgentRegistry

```typescript
// Adicionar agente
Input: InternalAgentRuntime
Output: Map<agentId, runtime> atualizado

// Executar agente
Input: agentId
Output: Agente executa um step

// Remover agente
Input: agentId
Output: Map<agentId, runtime> atualizado, runtime disposed
```

### AgentRunner

```typescript
// nextStep
Input: StepOptions (locale, conversationKey, etc)
Output: StepResult (messages, isDone, metrics)

// beginRun
Input: void
Output: runtime state initialized

// endRun
Input: void
Output: runtime state finalized
```

### ProviderLoader

```typescript
// loadCommunicationProviders
Input: ProviderCredentials[]
Output: CommunicationProvider[]

// unloadProvider
Input: providerType, agentId
Output: provider disposed
```

### AdminRoutes

```typescript
// POST /admin/agent
Input: CreateAgentRequest { name, roleId, workspacePath }
Output: Agent

// GET /admin/agent/:agentId
Input: agentId
Output: AgentDetails

// POST /admin/schedule
Input: ScheduleRequest { agentId, scheduleType, cronExpression }
Output: Schedule
```

## Fluxo de Credenciais

```
Banco (criptografado)
       ↓
read encryptedCredentials
       ↓
decryptSecret(encrypted)
       ↓
JSON.parse(credentials)
       ↓
Provider config
       ↓
Provider instanciado
```

## Fluxo de Budget

```
Contract (budget inicial)
       ↓
Step executa
       ↓
Tokens consumidos = inputTokens + outputTokens
       ↓
Budget deduzido = tokens * price_per_token
       ↓
Step logado
       ↓
Se budget <= 0 → agente para
```

## Fluxo de Memória

```
Execução inicia
       ↓
Carregar checkpoint (stateJson)
       ↓
Deserializar para RuntimeWorkingMemory
       ↓
Execução procede
       ↓
Estado muda
       ↓
Checkpointar (se mudança significativa)
       ↓
Serializar para JSON
       ↓
Salvar no banco
```

## Fluxo de Schedule

```
Schedule criado
       ↓
AgentScheduleManager registra
       ↓
Timer criado (setTimeout ou cron)
       ↓
Timer expira
       ↓
AgentRunner.nextStep()
       ↓
Próximo timer calculado e registrado
```

## Fluxo de Logger

```
Código executa
       ↓
forgeDebug({ scope, level, message, context })
       ↓
Se level >= LOG_LEVEL → output
       ↓
Console.log / file / external service
```
