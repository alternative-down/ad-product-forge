# Documentação do Sistema — ad-product-forge

## Índice

| # | Arquivo | Descrição |
|---|---------|-----------|
| 00 | [Overview](./00-overview.md) | Visão geral do sistema |
| 01 | [Arquitetura](./01-architecture.md) | Estrutura e módulos |
| 02 | [Modelo de Dados](./02-data-model.md) | Tabelas e relacionamentos |
| 03 | [Agentes](./03-agents.md) | Ciclo de vida, runtime, memória |
| 04 | [Admin API](./04-admin-api.md) | Rotas REST e read models |
| 05 | [Integrações](./05-integration.md) | GitHub, Coolify, Email, MiniMax |
| 06 | [Comunicação](./06-communication.md) | Providers e mensagens |
| 07 | [Configuração](./07-configuration.md) | Environment variables e settings |
| 08 | [Desenvolvimento](./08-development.md) | Setup, padrões, testes |
| 09 | [Tools](./09-tools.md) | Ferramentas disponíveis |
| 10 | [Monitoramento](./10-monitoring.md) | Health checks e métricas |
| 11 | [Troubleshooting](./11-troubleshooting.md) | Problemas comuns e soluções |
| 12 | [Segurança](./12-security.md) | Credenciais, permissions, best practices |

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

## Mantendo Documentação Atual

Esta documentação é baseada no código atual. Ao fazer mudanças significativas:

1. Atualize a seção relevante neste diretório
2. Verifique se todas as rotas/endpoints ainda existem
3. Atualize exemplos de código se necessário
4. Commit com mensagem: `docs: update <section-name>`

## Issues de Documentação

Se encontrar documentação desatualizada ou faltando, abra issue com label `documentation`.
