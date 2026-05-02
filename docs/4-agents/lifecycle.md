# Ciclo de Vida do Agente

## Estados do Agente

| Estado | Descrição |
|--------|-----------|
| `active` | Agente pode executar, está no registry |
| `inactive` | Agente pausado, não executa |
| `terminated` | Agente encerrado, não pode ser reativado |

## Diagrama de Estados

```
                    ┌──────────────────┐
                    │                  │
                    │      Hiring       │
                    │   (contratação)   │
                    │                  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │                  │
             ┌──────│      Active      │──────┐
             │      │   (executando)   │      │
             │      └──────────────────┘      │
             │               │               │
    ┌────────┴────────┐      │      ┌────────┴────────┐
    │                 │      │      │                 │
    │     Inactive    │      │      │   Terminates     │
    │      (pausado)  │      │      │   (encerrado)    │
    │                 │      │      │                 │
    └────────┬────────┘      │      └──────────────────┘
             │               │
             │    ┌──────────┘
             │    │ (voltar a executar)
             │    ▼
             └────┘
              (resumes)
```

## Hiring (Contratação)

O processo de hiring cria e configura um novo agente.

### Passo 1: Criar Role

```bash
curl -X POST http://localhost:3000/admin/role \
  -H "Content-Type: application/json" \
  -d '{
    "name": "developer",
    "description": "Desenvolvedor",
    "agentToolPermissions": ["github.create-issue"],
    "agentWorkflowPermissions": []
  }'
```

### Passo 2: Criar Agente

```bash
curl -X POST http://localhost:3000/admin/agent \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dev Assistant",
    "roleId": "role-uuid",
    "workspacePath": "./workspaces/dev-assistant"
  }'
```

### Passo 3: Configurar Providers

```bash
curl -X POST http://localhost:3000/admin/agent-provider/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "providerType": "discord",
    "credentials": {
      "token": "Bot xxx",
      "channels": [{"channelId": "123", "respondToMentionsOnly": true}]
    }
  }'
```

### Passo 4: Criar Schedule

```bash
curl -X POST http://localhost:3000/admin/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "scheduleType": "cron",
    "cronExpression": "0 * * * *",
    "isActive": true
  }'
```

### Passo 5: Criar Contrato

```bash
curl -X POST http://localhost:3000/admin/finance/contract \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "budgetUsd": 1000.00,
    "startsAt": 1704067200000,
    "endsAt": 1706755200000
  }'
```

### Código de Hiring

```typescript
// apps/forge/src/agents/hire-agent.ts
export async function hireAgent(
  db: Database,
  registry: InternalAgentRegistry,
  input: HireAgentInput
): Promise<Agent> {
  // 1. Validar role existe
  const role = await db.select().from(agentRoles)
    .where(eq(agentRoles.id, input.roleId));
  if (!role[0]) throw new Error('Role not found');
  
  // 2. Criar workspace
  await fs.mkdir(input.workspacePath, { recursive: true });
  
  // 3. Criar agente no banco
  const agentId = createId();
  await db.insert(agents).values({
    id: agentId,
    name: input.name,
    roleId: input.roleId,
    workspacePath: input.workspacePath,
    status: 'active',
    createdAt: Date.now(),
  });
  
  // 4. Criar runtime
  const runtime = await createAgentRuntime({
    agentId,
    llmProfile: input.llmProfile,
    capabilities: role[0],
    communicationProviders: input.providers,
    tools: input.tools,
  });
  
  // 5. Adicionar ao registry
  registry.add(runtime);
  registry.run(agentId);
  
  return agent;
}
```

## Active (Ativo)

O agente está em execução normal.

### Comportamento

- Scheduler dispara `nextStep` conforme cronograma
- Agente processa mensagens recebidas
- Agente pode executar tools
- Memória é mantida e checkpointada

### Operações Disponíveis

```typescript
// Pausar agente
await registry.stop(agentId);

// Ver status
const runtime = registry.get(agentId);
console.log(runtime.status); // 'idle' | 'running' | 'absent'

// Wake (forçar execução)
await registry.run(agentId);
```

## Inactive (Pausado)

O agente está pausado e não executa.

### Pausar

```bash
curl -X POST http://localhost:3000/admin/agent/$AGENT_ID/stop
```

### Retomar

```bash
curl -X POST http://localhost:3000/admin/agent/$AGENT_ID/wake
```

### Código

```typescript
// Pausar
registry.stop(agentId);
await db.update(agents)
  .set({ status: 'inactive' })
  .where(eq(agents.id, agentId));

// Retomar
registry.run(agentId);
await db.update(agents)
  .set({ status: 'active' })
  .where(eq(agents.id, agentId));
```

## Terminated (Encerrado)

O agente foi encerrado e não pode ser reativado.

### Processo de Termination

```typescript
// apps/forge/src/agents/terminate-agent.ts
export async function terminateAgent(
  db: Database,
  registry: InternalAgentRegistry,
  agentId: string
): Promise<void> {
  // 1. Parar scheduler
  const scheduler = registry.getScheduler(agentId);
  scheduler?.stop();
  
  // 2. Remover do registry
  registry.remove(agentId);
  
  // 3. Atualizar status no banco
  await db.update(agents)
    .set({ status: 'terminated' })
    .where(eq(agents.id, agentId));
  
  // 4. Manter histórico no banco
  // (steps, messages, checkpoints são mantidos)
}
```

### Encerrar via API

```bash
curl -X DELETE http://localhost:3000/admin/agent/$AGENT_ID
```

### Considerations

- Histórico é mantido para auditoria
- Workspace é mantido (pode ser limpo manualmente)
- Contratos são marcados como 'expired'
- Schedules são desativados

## Eventos do Ciclo de Vida

```typescript
// Eventos disparados
type AgentLifecycleEvent = 
  | 'hired'
  | 'activated'
  | 'paused'
  | 'resumed'
  | 'terminated'
  | 'budget_exhausted'
  | 'schedule_error';
```

### Listeners

```typescript
// Registrar listener
registry.on('budget_exhausted', (agentId) => {
  forgeDebug({
    scope: 'agent-lifecycle',
    level: 'warn',
    message: 'Agent budget exhausted',
    context: { agentId }
  });
  
  // Notificar admin
  notifyAdmin({
    title: 'Budget Exhausted',
    message: `Agent ${agentId} has exhausted its budget`,
  });
});
```
