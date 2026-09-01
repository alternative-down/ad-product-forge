# Agentes

## Conceito

Um agente no Forge é uma entidade autônoma que:

- Persiste em banco de dados
- Tem seu próprio runtime (LLM config + tools)
- Se comunica via providers configurados
- Executa em loops com `nextStep`
- Mantém memória de longo prazo

## Ciclo de Vida

```
Hiring → Active → (paused) → Terminated
```

### Hiring

Processo de admission de um novo agente:

1. Cria registro em `agents`
2. Cria role em `agent_roles`
3. Define permissions de tools e workflows
4. Cria contrato inicial em `agent_execution_contracts`
5. Popula workspace inicial
6. Adiciona ao registry

Arquivos principais:

- `hire-agent.ts` — workflow de hiring
- `hiring-profile.ts` — profile do hired
- `hiring-rh.ts` — lógica de RH

### Active

Agente em execução normal:

- Scheduler dispara `nextStep` periodicamente
- AgentRunner executa generate via LLM
- Tools são executadas se necessário
- LTM é checkpointado após mudanças de state

Arquivos principais:

- `agent-runner.ts` — loop principal
- `agent-runner-scheduler.ts` — scheduler com timers
- `agent-runtime-platform.ts` — runtime concreto

### Termination

Processo de saída de um agente:

1. Para scheduler
2. Disposa runtime
3. Remove do registry
4. Atualiza status para `terminated`
5. Mantém histórico em banco

Arquivos principais:

- `terminate-agent.ts` — workflow de termination

## Runtime

### AgentRunner

Orquestra a execução de um agente.

```typescript
const runner = new AgentRunner(runtime, store, options);
await runner.beginRun();
await runner.nextStep(options);
await runner.endRun();
```

Responsabilidades:

- Gerencia loop de execução
- Detecta loops (loop detector)
- Controla timeouts (15 min default)
- Atualiza estado de execução

### AgentRuntime

Runtime concreto que executa prompts.

```typescript
const runtime = await createAgentRuntime({
  agentId,
  llmProfile,
  capabilities,
  communicationProviders,
  tools,
});
```

### Scheduler

Dispara `nextStep` dos agentes baseado em schedules.

```typescript
const scheduler = createAgentScheduleManager(db, registry);
scheduler.schedule(agentId, nextStepAt);
```

Tipos de schedule:

- `cron` — expressão cron (ex: `0 * * * *`)
- `interval` — intervalo em ms
- `oneshot` — execução única

## Memória

### Working Memory

Memória de curto prazo durante execução.

```typescript
interface RuntimeWorkingMemory {
  messages: Array<RuntimeMessage>;
  observations: Array<Observation>;
  reflections: Array<Reflection>;
}
```

### Long-Term Memory (LTM)

Memória de longo prazo com checkpointing.

```typescript
interface AgentCheckpointedOmState {
  checkpointedOmTotalContextTokens: number;
  checkpointedOmRecentRawTokens: number;
  stateJson: string; // Operational memory serializado
}
```

Arquivos principais:

- `agent-long-term-memory.ts` — checkpointing
- `agent-long-term-memory-recall.ts` — recall e busca
- `agent-long-term-memory-store.ts` — persistência

## Communication Providers

Cada agente pode ter múltiplos providers configurados.

### Discord

```typescript
const discord = createDiscordProvider({
  token: 'DISCORD_BOT_TOKEN',
  channels: [{ channelId: '123', respondToMentionsOnly: false }],
});
```

Features:

- Channel filtering
- Mention detection
- Echo prevention (2 min TTL)
- Typing indicators

### Internal Chat

```typescript
const internalChat = createInternalChatProvider({ agentId });
```

Chat interno entre agentes e admin.

### Email

```typescript
const email = createEmailProvider({
  imap: { host, port, user, password },
  smtp: { host, port, user, password },
});
```

Migadu integration para email.

## Skills

### Workspace Skills

Skills instaladas no workspace do agente.

```typescript
const skills = await loadWorkspaceSkills(workspacePath);
```

Formato: ZIP com estrutura de skill.

### Global Skills

Skills compartilhadas disponíveis para todos os agentes.

```typescript
import { globalSkills } from './global-skills';
```

Skills bundled no código.

## Tool Permissions

Cada role define quais tools o agente pode usar.

```typescript
interface RoleToolPermission {
  roleId: string;
  toolId: string; // ex: 'github.create-issue', 'discord.send-message'
}
```

Verificado em runtime antes de executar tool.
