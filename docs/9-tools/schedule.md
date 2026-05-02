# Ferramentas de Schedule

## create

Criar um novo schedule.

```typescript
await tools.schedules.create({
  agentId: 'agent-uuid',
  scheduleType: 'cron',
  cronExpression: '0 * * * *',
});
```

## update

Atualizar um schedule existente.

```typescript
await tools.schedules.update({
  scheduleId: 'schedule-uuid',
  cronExpression: '*/30 * * * *',
  isActive: true,
});
```

## delete

Deletar um schedule.

```typescript
await tools.schedules.delete({
  scheduleId: 'schedule-uuid',
});
```

## getNextStepAt

Obter próximo step time.

```typescript
const nextStep = await tools.schedules.getNextStepAt({
  agentId: 'agent-uuid',
});
```
