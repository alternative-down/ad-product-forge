# Padrões de Código

## TypeScript

### Tipos

```typescript
// Interfaces para contratos
interface AgentRuntime {
  id: string;
  runner: AgentRunner;
  status: 'idle' | 'running' | 'absent';
}

// Types para unions
type ProviderType = 'discord' | 'internal-chat' | 'email';

// Types para aliases
type AgentId = string;
type ScheduleId = string;
```

### Funções

```typescript
// Tipos explícitos em funções públicas
export function createAgent(
  input: CreateAgentInput
): Promise<Agent> {
  // implementação
}

// Parâmetros opcionais com defaults
function execute(
  agentId: string,
  options?: ExecutionOptions
): Promise<void> {
  const opts = { timeout: 5000, ...options };
}
```

## Async/Await

```typescript
// Bom
async function fetchAgent(agentId: string): Promise<Agent | null> {
  const result = await db.select().from(agents)
    .where(eq(agents.id, agentId));
  return result[0] ?? null;
}

// Evitar misturar .then() com await
async function processData() {
  // Bom
  const result = await fetchData();
  const processed = await processData(result);
  
  // Ruim
  fetchData().then(result => {
    processData(result).then(processed => { ... });
  });
}
```

## Error Handling

```typescript
// Try-catch para erros recuperáveis
try {
  await riskyOperation();
} catch (error) {
  forgeDebug({
    scope: 'module',
    level: 'warn',
    message: 'Operation failed but continuing',
    context: { error }
  });
  return defaultValue;
}

// Propagar erros fatais após log
try {
  await mightFail();
} catch (error) {
  forgeDebug({
    scope: 'module',
    level: 'error',
    message: 'Critical failure',
    context: { error }
  });
  throw error;
}
```

## Logging

```typescript
import { forgeDebug } from '@forge-runtime/core';

forgeDebug({
  scope: 'module-name',
  level: 'debug',     // debug, info, warn, error
  message: 'Description',
  context: { data: value },
});
```

## Validação

```typescript
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(100),
  roleId: z.string().uuid(),
  workspacePath: z.string().min(1),
});

function handleInput(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.message } };
  }
  return { status: 200, body: { data: parsed.data } };
}
```

## Nomenclatura

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Arquivos | kebab-case | `agent-runner.ts` |
| Funções | camelCase | `createAgent`, `loadProviders` |
| Interfaces/Types | PascalCase | `AgentRuntime`, `CreateAgentInput` |
| Constantes | SCREAMING_CASE | `ONE_MINUTE_MS`, `MAX_RETRIES` |
| Enums | PascalCase | `AgentStatus.Active` |

## Imports

```typescript
// Módulos externos
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';

// Módulos internos
import { createAgentStore } from './store';
import { agents } from '../database/schema';

// Types
import type { Agent, AgentRole } from '../types';

// Evitar imports circulares
```

## Commits

```
type(scope): description

Types:
- feat: nova feature
- fix: correção de bug
- refactor: refatoração
- test: adicionar/modificar testes
- docs: documentação
- chore: manutenção
```
