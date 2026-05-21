# Tarefas Entre Agentes

> **Baseado em:** Issue #225 (Agent-to-Agent Task Scheduling)  
> **Última atualização:** 27/03/2026  
> **Autora:** Wiki Witch Writa

## Visão Geral

O sistema de tarefas entre agentes permite que um agente-coordenador delegue trabalhos para outros agentes de forma estruturada e rastreável.

## Conceitos Fundamentais

```
┌─────────────────────────────────────────────────────────────────┐
│               COORDENAÇÃO DE CRONS ENTRE AGENTES                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   COORDINATOR                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  manage_crons({                                        │  │
│   │    action: 'create',                                   │  │
│   │    targetAgentId: 'agent-backend',                     │  │
│   │    name: 'Review PR #123',                             │  │
│   │    scheduleType: 'date'                                │  │
│   │  })                                                    │  │
│   └─────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │              SCHEDULED CRON CREATED                     │  │
│   │  id: cron_xxx, active: true                            │  │
│   └─────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│   AGENT (backend)                                              │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  list_crons() → [cron_xxx]                             │  │
│   │  execute cron_xxx                                      │  │
│   └─────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │            TASK COMPLETED                                │  │
│   │  status: completed, completedAt: timestamp              │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Roles e Permissões

| Role            | Permissões                                                    |
| --------------- | ------------------------------------------------------------- |
| **COORDINATOR** | Criar, listar, cancelar e atualizar tarefas de outros agentes |
| **AGENT**       | Listar e executar apenas as próprias tarefas                  |

### Pré-requisitos

O workflow `hire-internal-agent` (Issue #242) deve estar implementado para configurar o role COORDINATOR.

## API Endpoints

### Criar Tarefa

```http
POST /admin/agent/task/create
```

```typescript
interface CreateTaskInput {
  targetAgentId: string; // ID do agente que executará
  taskDescription: string; // Descrição da tarefa
  taskType: TaskType; // Tipo da tarefa
  schedule?: TaskSchedule; // Agendamento opcional
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  context?: Record<string, unknown>; // Dados extras
}

type TaskType = 'code_review' | 'documentation' | 'testing' | 'deployment' | 'research' | 'general';

type TaskSchedule =
  | { type: 'once'; executeAt: number } // Uma vez
  | { type: 'recurring'; intervalMs: number } // Recorrente
  | { type: 'cron'; expression: string }; // Cron
```

### Listar Tarefas

```http
GET /admin/agent/tasks?agentId={agentId}&status={status}
```

### Cancelar Tarefa

```http
POST /admin/agent/task/cancel
```

```typescript
interface CancelTaskInput {
  taskId: string;
  reason?: string;
}
```

### Atualizar Tarefa

```http
POST /admin/agent/task/update
```

```typescript
interface UpdateTaskInput {
  taskId: string;
  updates: {
    status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    result?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  };
}
```

## Ferramentas Disponíveis

### manage_crons

Cria, atualiza ou deleta um cron para outro agente.

```typescript
const result = await manage_crons({
  action: 'create',
  targetAgentId: 'agent-id',
  name: 'Revisar PR #123',
  scheduleType: 'date',
  scheduledDate: '2026-04-06T15:00:00.000Z',
  timezone: 'UTC',
  content: 'Revisar PR #123'
});

// Response
{
  cronId: 'cron_abc123',
  targetAgentId: 'agent-id',
  scheduleType: 'date'
}
```

### list_crons

Lista crons criados para outros agentes.

```typescript
const crons = await list_crons({
  targetAgentId: 'agent-id',
});

// Response
[{ cronId: 'cron_abc123', targetAgentId: 'agent-id' }];
```

### manage_self_crons

Cria, atualiza ou deleta um cron próprio.

```typescript
await manage_self_crons({
  action: 'update',
  cronId: 'cron_abc123',
  isActive: false,
});
```

### list_self_crons

Lista crons próprios.

```typescript
const crons = await list_self_crons({});
```

## Modelo de Dados

```typescript
interface ScheduledTask {
  id: string;
  coordinatorId: string; // Quem criou
  targetAgentId: string; // Quem executa
  description: string;
  taskType: TaskType;
  status: TaskStatus;
  priority: Priority;

  // Agendamento
  scheduleType?: 'once' | 'recurring' | 'cron';
  scheduledTime?: number; // para 'once'
  recurringInterval?: number; // para 'recurring' (ms)
  cronExpression?: string; // para 'cron'

  // Execução
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;

  // Meta
  context?: Record<string, unknown>;
  cancelReason?: string;
}

type TaskStatus =
  | 'pending' // Aguardando execução
  | 'scheduled' // Agendada para futuro
  | 'in_progress' // Em execução
  | 'completed' // Finalizada com sucesso
  | 'cancelled' // Cancelada
  | 'failed'; // Falhou

type Priority = 'low' | 'medium' | 'high' | 'urgent';
```

## User Stories

### US1: Coordenador cria tarefa

> Como **coordenador**, quero **criar uma tarefa para um agente** para **delegar trabalho de forma rastreável**.

**Critérios:**

- [ ] Coordenador pode especificar agente-alvo
- [ ] Coordenador pode definir descrição e tipo
- [ ] Coordenador pode agendar para execução única, recorrente ou cron
- [ ] Sistema registra metadata (criador, timestamps)

### US2: Agente executa tarefa

> Como **agente**, quero **visualizar e executar tarefas atribuídas** para **cumprir minhas responsabilidades**.

**Critérios:**

- [ ] Agente pode listar tarefas pendentes
- [ ] Agente pode ver detalhes completos da tarefa
- [ ] Agente pode atualizar status durante execução
- [ ] Agente pode marcar como concluída com resultado

### US3: Coordenador gerencia tarefas

> Como **coordenador**, quero **cancelar ou modificar tarefas** para **adaptar o planejamento conforme necessário**.

**Critérios:**

- [ ] Coordenador pode cancelar tarefas pendentes
- [ ] Coordenador pode atualizar prioridade
- [ ] Coordenador pode reagendar tarefas
- [ ] Sistema registra razão do cancelamento

### US4: Status visível

> Como **stakeholder**, quero **ver o status das tarefas** para **acompanhar o progresso**.

**Critérios:**

- [ ] UI mostra todas as tarefas com status
- [ ] Filtros por status, agente, data
- [ ] Histórico de execuções mantido

## Casos Especiais

### Sessão expirou durante criação

1. Salvar draft localmente
2. Ao reconectar, verificar draft pendente
3. Oferecer opção de continuar ou descartar

### Erro de rede durante atualização

1. Implementar retry com backoff exponencial
2. Se falhar após 3 tentativas, marcar como `pending_retry`
3. UI mostra status "Sincronizando..."

### Tarefa agendada para agente inexistente

1. Validar existência do agente antes de criar
2. Se não existir, retornar erro com mensagem clara

## Rate Limiting

| Ação             | Limite | Janela     |
| ---------------- | ------ | ---------- |
| Criar tarefa     | 100    | por minuto |
| Listar tarefas   | 300    | por minuto |
| Atualizar tarefa | 200    | por minuto |

---

**Tags:** `agents` `scheduling` `coordination` `tasks`
