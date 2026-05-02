# Architecture

## High-Level Design

Forge is a multi-agent platform. Each agent is an isolated process with its own runtime, memory, and tools. The system orchestrates agents through a scheduler and registry.

## Components

### Agent Registry (`internal-agent-registry.ts`)

Singleton Map storing all active agent runtimes.

```typescript
const registry = getInternalAgentRegistry();
registry.add(runtime);
registry.run(agentId);
registry.remove(agentId);
```

### Agent Runner (`agent-runner.ts`)

Orchestrates agent execution.

```typescript
const runner = new AgentRunner(runtime, store, options);
await runner.beginRun();
await runner.nextStep(options);
await runner.endRun();
```

### Agent Scheduler (`agent-runner-scheduler.ts`)

Triggers `nextStep` based on schedules.

```typescript
const scheduler = createAgentScheduleManager(db, registry);
scheduler.schedule(agentId, {
  scheduleType: 'cron',
  cronExpression: '0 * * * *',
});
```

### Communication Provider Loader

Loads providers from encrypted credentials.

```typescript
const providers = await loadCommunicationProviders({
  discord: { token: '...', channels: [...] },
  internalChat: { agentId: '...' },
  email: { imap: {...}, smtp: {...} },
});
```

## Architecture Patterns

### Dependency Injection

Stores created via factories with `db` injected:

```typescript
const capabilities = createCapabilityStore(db);
const agentContracts = createAgentContractStore(db);
```

Exception: `getInternalAgentRegistry()` is a global singleton.

### Logging

Standard: `forgeDebug({ scope, level, message, context })`

```typescript
forgeDebug({
  scope: 'agent-runner',
  level: 'error',
  message: 'healthcheck failed',
  context: { error },
});
```

### Validation

Zod schemas for all API input:

```typescript
const upsertAgentSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'internal-chat', 'email']),
  credentials: z.unknown(),
});
```

### Encryption

AES-GCM for sensitive credentials:

```typescript
const encrypted = encryptSecret(JSON.stringify(credentials));
const decrypted = JSON.parse(decryptSecret(encrypted));
```

## Key Files

| File | Lines | Responsibility |
|------|-------|----------------|
| `github/manager.ts` | 1477 | GitHub Apps management |
| `admin/routes.ts` | 1348 | Admin REST API |
| `internal-chat-service.ts` | 1316 | Internal chat service |
| `agent-runner.ts` | 1308 | Agent execution |
| `agent-long-term-memory-recall.ts` | 1220 | Memory recall |
| `database/schema.ts` | 801 | Database schema |
| `coolify/manager.ts` | 742 | Coolify integration |
| `discord-account.ts` | 676 | Discord provider |

## State Management

| State | Meaning |
|-------|---------|
| `idle` | Agent stopped, waiting for next step |
| `running` | Agent executing generate() |
| `absent` | Agent not in registry |
