# Conceitos Fundamentais

Este documento explica os conceitos-chave do sistema ad-product-forge. Entender estes termos é essencial para trabalhar efetivamente com o sistema.

## Agent (Agente)

Um **agente** é uma entidade autônoma que opera dentro do sistema Forge.

### Estrutura de um Agente

```typescript
interface Agent {
  id: string;                    // UUID único
  name: string;                 // Nome descritivo
  roleId: string;               // ID do role atribuído
  status: 'active' | 'inactive' | 'terminated';
  workspacePath: string;        // Caminho do workspace no filesystem
  createdAt: number;            // Timestamp de criação
  lastInitAt: number;           // Timestamp do último init
}
```

### Estados do Agente

| Estado | Significado |
|--------|-------------|
| `active` | Agente está operacional e pode executar |
| `inactive` | Agente está pausado, não executa |
| `terminated` | Agente foi encerrado, não pode ser reativado |

### Ciclo de Vida

```
Hiring (contratação)
  ↓
Active (ativo, executando)
  ↓ (opcional)
Inactive (pausado)
  ↓
Terminated (encerrado)
```

## Role (Papel)

Um **role** define um conjunto de permissões que podem ser atribuídas a agentes.

### Estrutura de um Role

```typescript
interface AgentRole {
  id: string;                           // UUID do role
  name: string;                         // Nome (ex: "developer", "qa")
  description: string;                  // Descrição textual
  agentToolPermissions: string[];       // Lista de tool IDs permitidos
  agentWorkflowPermissions: string[];   // Lista de workflow IDs permitidos
}
```

### Exemplos de Roles

```typescript
// Role de desenvolvedor
{
  name: "developer",
  description: "Desenvolvedor com acesso ao GitHub",
  agentToolPermissions: [
    "github.create-issue",
    "github.create-pull-request",
    "github.commit-file",
    "github.merge-pull-request",
    "coolify.list-applications",
    "coolify.deploy-application",
  ],
}

// Role de QA
{
  name: "qa",
  description: "QA engineer com acesso de leitura",
  agentToolPermissions: [
    "github.list-issues",
    "github.get-pull-request",
    "coolify.list-applications",
    "coolify.get-logs",
  ],
}
```

## Capability (Capacidade)

**Capabilities** são funcionalidades adicionais que um agente pode ter, além das permissões básicas definidas pelo role.

### Diferença entre Role e Capability

| Aspecto | Role | Capability |
|---------|------|------------|
| Escopo | Conjunto de permissões | Funcionalidade específica |
| Uso | Controle de acesso | Habilitar features |
| Herança | Agente herda todas as tools do role | Adicionada individualmente |

## Contract (Contrato)

Um **contract** define o acordo financeiro e temporal de um agente.

```typescript
interface AgentExecutionContract {
  id: string;                    // UUID do contrato
  agentId: string;               // Agente dono do contrato
  startsAt: number;              // Timestamp de início
  endsAt: number;                // Timestamp de fim
  budgetUsd: number;             // Orçamento em USD
  status: 'active' | 'paused' | 'expired';
}
```

### Fluxo de Budget

1. Contrato é criado com orçamento definido
2. Cada execução (step) consome parte do orçamento
3. Orçamento é deduzido baseado no uso de tokens LLM
4. Quando o orçamento acaba, o agente para de executar
5. Top-ups podem ser feitos para adicionar mais budget

## Step (Execução)

Um **step** é uma única execução do agente.

```typescript
interface AgentExecutionStep {
  id: string;                // UUID do step
  contractId: string;        // Contrato usado
  agentId: string;           // Agente que executou
  llmProfileId: string;      // Perfil LLM utilizado
  stepType: string;          // Tipo do step
  inputTokens: number;       // Tokens de entrada
  outputTokens: number;      // Tokens de saída
  durationMs: number;         // Duração em milliseconds
  createdAt: number;         // Timestamp de criação
}
```

## Provider (Provedor)

**Providers** são módulos que permitem a comunicação entre agentes e o mundo externo.

### Tipos de Provider

| Provider | Descrição |
|----------|-----------|
| Discord | Canal Discord (guild + DM) |
| Internal Chat | Chat interno entre agentes |
| Email | Integração com Migadu |

### Configuração de Provider

```typescript
// Discord
{
  type: 'discord',
  credentials: {
    token: 'Bot xxx',
    channels: [
      { channelId: '123', respondToMentionsOnly: false }
    ]
  }
}

// Internal Chat
{
  type: 'internal-chat',
  credentials: {
    agentId: 'agent-uuid'
  }
}

// Email
{
  type: 'email',
  credentials: {
    imap: { host, port, user, password },
    smtp: { host, port, user, password }
  }
}
```

## Schedule (Agendamento)

**Schedules** definem quando um agente deve ser executado.

### Tipos de Schedule

| Tipo | Descrição | Exemplo |
|------|-----------|---------|
| `cron` | Expressão cron | `0 * * * *` (a cada hora) |
| `interval` | Intervalo em ms | `3600000` (1 hora) |
| `oneshot` | Execução única | Timestamp específico |

### Exemplos de Cron

```bash
# A cada hora no minuto 0
0 * * * *

# A cada 30 minutos
*/30 * * * *

# Todo dia às 9h
0 9 * * *
```

## Tool (Ferramenta)

**Tools** são funções que os agentes podem chamar durante a execução.

### Categories de Tools

| Categoria | Prefixo | Exemplo |
|-----------|---------|---------|
| GitHub | `github.` | `github.create-issue`, `github.commit-file` |
| Coolify | `coolify.` | `coolify.deploy-application` |
| Discord | `discord.` | `discord.send-message` |
| Email | `email.` | `email.send` |

## Memory (Memória)

### Working Memory

Memória de curto prazo durante a execução de um step.

```typescript
interface RuntimeWorkingMemory {
  messages: Array<RuntimeMessage>;      // Histórico de mensagens
  observations: Array<Observation>;    // Observações recentes
  reflections: Array<Reflection>;      // Reflexões do agente
}
```

### Long-Term Memory (LTM)

Memória persistente entre sessões com checkpointing.

```typescript
interface AgentCheckpointedOmState {
  id: string;
  agentId: string;
  checkpointedOmTotalContextTokens: number;
  checkpointedOmRecentRawTokens: number;
  stateJson: string;  // Estado operacional serializado
}
```

## LLM Profile (Perfil LLM)

```typescript
interface LlmProfile {
  id: string;
  name: string;                  // ex: "primary", "om"
  provider: 'openai' | 'minimax' | 'anthropic';
  model: string;                // ex: "gpt-4", "claude-3"
  temperature: number;         // 0-2
  maxTokens: number;            // Máximo de tokens na resposta
}
```

| Perfil | Uso | Descrição |
|--------|-----|-----------|
| `primary` | Execução normal | Para operações gerais |
| `om` | Operational Memory | Para tarefas de memória operacional |

## Registry (Registro)

O **registry** é o central hub que mantém todas as instâncias de runtime dos agentes ativos.

```typescript
const registry = getInternalAgentRegistry();

// Operações
registry.add(runtime);           // Adicionar agente
registry.remove(agentId);        // Remover agente
registry.get(agentId);           // Obter runtime
registry.list();                 // Listar todos
registry.run(agentId);           // Iniciar execução
registry.stop(agentId);          // Parar execução
```

## Workspace

Cada agente possui um **workspace** dedicado no filesystem.

```
workspaces/
├── agent-uuid-1/
│   ├── skills/           # Skills instaladas
│   ├── memory/           # Arquivos de memória
│   ├── artifacts/        # Artefatos gerados
│   └── .agent-codex/     # Código e configurações
└── agent-uuid-2/
    └── ...
```

| Diretório | Descrição |
|-----------|-----------|
| `skills/` | Skills instaladas |
| `memory/` | Arquivos de memória persistente |
| `artifacts/` | Artefatos gerados pelo agente |
| `.agent-codex/` | Configurações e estado |

## Ledger

Sistema de controle financeiro.

### Tipos de Entrada

| Tipo | Descrição |
|------|-----------|
| `credit` | Entrada de dinheiro (top-up) |
| `debit` | Saída (uso de budget) |
| `adjustment` | Ajuste manual |

```typescript
interface LedgerEntry {
  id: string;
  type: 'credit' | 'debit' | 'adjustment';
  amount: number;         // Valor em USD
  description: string;    // Descrição
  createdAt: number;
}
```
