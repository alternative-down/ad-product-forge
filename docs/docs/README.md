# Documentação do Sistema

## Arquivos

1. [Overview](./01-architecture.md) - Visão geral do sistema
2. [Arquitetura](./01-architecture.md) - Estrutura e módulos
3. [Modelo de Dados](./02-data-model.md) - Tabelas e relacionamentos
4. [Agentes](./03-agents.md) - Ciclo de vida, runtime, memória
5. [Admin API](./04-admin-api.md) - Rotas REST e read models
6. [Integrações](./05-integration.md) - GitHub, Coolify, Email, MiniMax
7. [Comunicação](./06-communication.md) - Providers e mensagem

## Quick Reference

### Inicializar agente

```typescript
const runtime = await createAgentRuntime({
  agentId: 'uuid',
  llmProfile: 'gpt-4',
  capabilities: ['github', 'discord'],
  communicationProviders: [discord, internalChat, email],
  tools: [githubTools, coolifyTools],
});
registry.add(runtime);
registry.run(agentId);
```

### Criar schedule

```typescript
const scheduler = createAgentScheduleManager(db, registry);
scheduler.schedule(agentId, {
  scheduleType: 'cron',
  cronExpression: '0 * * * *',
});
```

### Adicionar provider

```typescript
await db.insert(agentProviders).values({
  agentId,
  providerType: 'discord',
  encryptedCredentials: encryptSecret(JSON.stringify({ token: '...' })),
});
```

### Ver logs

```typescript
const steps = await db.select().from(agentExecutionSteps)
  .where(eq(agentExecutionSteps.agentId, agentId))
  .orderBy(desc(agentExecutionSteps.createdAt))
  .limit(100);
```
