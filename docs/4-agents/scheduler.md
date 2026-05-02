# Scheduler do Agente

## Visão Geral

O **AgentScheduler** é responsável por triggering a execução dos agentes conforme schedules definidos.

## Estrutura

```typescript
// apps/forge/src/agents/agent-runner-scheduler.ts (~674 linhas)
interface AgentScheduleManager {
  // Criar schedule
  schedule(agentId: string, schedule: ScheduleConfig): void;
  
  // Cancelar schedule
  unschedule(agentId: string): void;
  
  // Pausar todos
  pauseAll(): void;
  
  // Retomar todos
  resumeAll(): void;
  
  // Obter próximo step time
  getNextStepAt(agentId: string): number | null;
}

interface ScheduleConfig {
  scheduleType: 'cron' | 'interval' | 'oneshot';
  cronExpression?: string;
  intervalMs?: number;
  nextStepAt?: number;
  isActive: boolean;
}
```

## Tipos de Schedule

### Cron

Expressões cron para agendamento recurring.

```bash
# A cada hora no minuto 0
0 * * * *

# A cada 30 minutos
*/30 * * * *

# Todo dia às 9h
0 9 * * *

# Todo domingo às 18h
0 18 * * 0

# Segunda a sexta, a cada hora das 9h às 18h
0 9-18 * * 1-5
```

### Interval

Intervalo fixo em milliseconds.

```typescript
// A cada 30 minutos
{
  scheduleType: 'interval',
  intervalMs: 30 * 60 * 1000
}

// A cada 2 horas
{
  scheduleType: 'interval',
  intervalMs: 2 * 60 * 60 * 1000
}
```

### Oneshot

Execução única em um timestamp específico.

```typescript
{
  scheduleType: 'oneshot',
  nextStepAt: Date.parse('2024-12-25T09:00:00Z')
}
```

## Fluxo de Scheduler

```
Schedule criado
       │
       ▼
┌─────────────────────────────┐
│ Parse Cron Expression        │
│ (se cron)                    │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Criar Timer                  │
│ setTimeout / setInterval     │
└─────────────────────────────┘
       │
       ▼
   Timer expira
       │
       ▼
┌─────────────────────────────┐
│ Verificar se agent existe   │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ AgentRunner.nextStep()       │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Calcular próximo step       │
│ Atualizar nextStepAt        │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Criar próximo timer         │
└─────────────────────────────┘
```

## Exemplo de Uso

### Criar Schedule via API

```bash
# Cron schedule - a cada hora
curl -X POST http://localhost:3000/admin/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "scheduleType": "cron",
    "cronExpression": "0 * * * *",
    "isActive": true
  }'

# Interval schedule - a cada 30 minutos
curl -X POST http://localhost:3000/admin/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "scheduleType": "interval",
    "intervalMs": 1800000,
    "isActive": true
  }'
```

### Atualizar Schedule

```bash
# Atualizar cron expression
curl -X PUT http://localhost:3000/admin/schedule/schedule-uuid \
  -H "Content-Type: application/json" \
  -d '{"cronExpression": "*/30 * * * *"}'

# Desativar
curl -X POST http://localhost:3000/admin/schedule/schedule-uuid/toggle
```

### Cancelar Schedule

```bash
curl -X DELETE http://localhost:3000/admin/schedule \
  -H "Content-Type: application/json" \
  -d '{"scheduleId": "schedule-uuid"}'
```

## Implementação

```typescript
// apps/forge/src/agents/agent-runner-scheduler.ts
export function createAgentScheduleManager(
  db: Database,
  registry: InternalAgentRegistry
): AgentScheduleManager {
  const timers = new Map<string, NodeJS.Timeout>();
  
  return {
    async schedule(agentId: string, config: ScheduleConfig) {
      // Cancelar schedule existente
      this.unschedule(agentId);
      
      // Calcular próximo step
      let nextStepAt = config.nextStepAt ?? Date.now();
      
      // Criar timer
      const ms = calculateDelay(nextStepAt);
      const timer = setTimeout(async () => {
        const runtime = registry.get(agentId);
        if (!runtime) {
          forgeDebug({
            scope: 'scheduler',
            level: 'warn',
            message: 'Agent not found for scheduled execution',
            context: { agentId }
          });
          return;
        }
        
        try {
          await runtime.runner.nextStep({ triggerType: 'schedule' });
        } catch (error) {
          forgeDebug({
            scope: 'scheduler',
            level: 'error',
            message: 'Scheduled execution failed',
            context: { agentId, error }
          });
        }
        
        // Agendar próximo
        this.schedule(agentId, config);
      }, ms);
      
      timers.set(agentId, timer);
      
      // Persistir no banco
      await db.insert(schedules).values({
        id: createId(),
        agentId,
        scheduleType: config.scheduleType,
        cronExpression: config.cronExpression,
        intervalMs: config.intervalMs,
        nextStepAt,
        isActive: true,
      });
    },
    
    unschedule(agentId: string) {
      const timer = timers.get(agentId);
      if (timer) {
        clearTimeout(timer);
        timers.delete(agentId);
      }
    },
    
    getNextStepAt(agentId: string): number | null {
      const schedule = await db.select().from(schedules)
        .where(and(
          eq(schedules.agentId, agentId),
          eq(schedules.isActive, true)
        ));
      return schedule[0]?.nextStepAt ?? null;
    }
  };
}
```

## Timezone

O scheduler usa timezone UTC por padrão.

```typescript
// Para usar timezone local
const nextStepAt = cronParser(config.cronExpression, { tz: 'America/Sao_Paulo' });
```

## Error Handling

```typescript
try {
  await runtime.runner.nextStep({ triggerType: 'schedule' });
} catch (error) {
  forgeDebug({
    scope: 'scheduler',
    level: 'error',
    message: 'Scheduled execution failed',
    context: { 
      agentId,
      error,
      nextStepAt: schedule.nextStepAt,
      retryCount: getRetryCount(agentId)
    }
  });
  
  // Não falha o scheduler, agenda retry
  if (shouldRetry(schedule)) {
    this.schedule(agentId, {
      ...schedule,
      nextStepAt: Date.now() + getRetryDelay(schedule)
    });
  }
}
```

## Estado do Schedule

| Campo | Descrição |
|-------|-----------|
| `id` | UUID do schedule |
| `agentId` | Agente afetado |
| `scheduleType` | cron, interval, ou oneshot |
| `cronExpression` | Expressão cron (se cron) |
| `intervalMs` | Intervalo em ms (se interval) |
| `nextStepAt` | Timestamp do próximo step |
| `isActive` | Se está ativo |
