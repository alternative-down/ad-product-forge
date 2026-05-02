# Desenvolvimento

## Setup

### Pré-requisitos

- Node.js 20+
- npm ou pnpm
- SQLite (ou Turso para dev)

### Instalação

```bash
# Clonar repo
git clone https://github.com/alternative-down/ad-product-forge.git
cd ad-product-forge

# Instalar dependências
npm install

# Criar arquivo .env
cp .env.example .env

# Gerar ENCRYPTION_KEY
openssl rand -base64 32
# Colocar no .env como ENCRYPTION_KEY=xxx
```

### Variáveis de Ambiente Mínimas

```bash
ENCRYPTION_KEY=<32-byte-base64-key>
DATABASE_URL=file:./data/forge.db
FORGE_DATA_PATH=./data
WORKSPACE_BASE_PATH=./workspaces
HTTP_PORT=3000
```

### Rodar em Development

```bash
# Development mode (com hot reload via tsx)
npm run dev

# Production mode
npm run build
npm start
```

### Tests

```bash
# Todos os tests
npm test

# Tests de um módulo
npm test -- --grep "agent-runner"

# Coverage
npm run test:coverage

# Tests em watch mode
npm test -- --watch
```

## Estrutura de Branching

```
main           → Produção (só merge via stage)
stage          → Homologação (para testes)
develop        → Integração (PR base)
fix/xxx        → Fixes
feat/xxx       → Features
docs/xxx       → Documentação
refactor/xxx   → Refatoração
```

### Fluxo de Trabalho

1. Criar branch de `develop` atualizada
2. Desenvolver
3. Abrir PR para `develop`
4. Aguardar aprovação + tests
5. Veritas faz merge

## Padrões de Código

### TypeScript

- Usar tipos explícitos em funções públicas
- Interfaces para contratos entre módulos
- Types para unions e intersections

```typescript
// Bom
interface AgentRuntime {
  id: string;
  agentId: string;
  status: 'idle' | 'running' | 'absent';
  generate(options: GenerateOptions): Promise<GenerateResult>;
}

// Bom
type ExecutionState = 'idle' | 'running' | 'absent';
```

### Nomes

- **Arquivos**: kebab-case (`agent-runner.ts`, `coolify-manager.ts`)
- **Funções**: camelCase ou verb+noun (`createAgent`, `loadProviders`)
- **Interfaces/Types**: PascalCase (`AgentRuntime`, `LlmProfile`)
- **Constantes**: SCREAMING_CASE para valores mágicos (`ONE_MINUTE_MS`, `MAX_RETRIES`)

### Funções

- Funções pequenas (< 50 linhas)
- Uma responsabilidade por função
- early return para erros

```typescript
// Bom
async function loadAgent(id: string): Promise<Agent | null> {
  const agent = await db.select().from(agents).where(eq(agents.id, id));
  return agent ?? null;
}

// Evitar
async function loadAgent(id: string): Promise<Agent | null> {
  try {
    const result = await db.select().from(agents).where(eq(agents.id, id));
    if (result && result.length > 0) {
      return result[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error(error);
    return null;
  }
}
```

### Async/Await

- Preferir async/await sobre .then()
- Não misturar os dois estilos

```typescript
// Bom
const result = await fetchData();
const processed = await processData(result);

// Evitar
fetchData().then(result => {
  processData(result).then(processed => {
    // callback hell
  });
});
```

## Logging

Usar `forgeDebug` para todo logging:

```typescript
import { forgeDebug } from '@forge-runtime/core';

forgeDebug({
  scope: 'module-name',
  level: 'error', // 'debug' | 'info' | 'warn' | 'error'
  message: 'Description of event',
  context: { 
    relevantData: 'value',
    error: error,
  },
});
```

**Níveis:**
- `debug` — detalhes de execução (verbose)
- `info` — eventos significativos
- `warn` — situações inesperadas mas não-críticas
- `error` — falhas que precisam de atenção

## Error Handling

### Validação

Usar Zod schemas para validar inputs:

```typescript
import { z } from 'zod';

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  roleId: z.string().uuid(),
  workspacePath: z.string().min(1),
});

function handleCreateAgent(input: unknown) {
  const parsed = createAgentSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.message } };
  }
  // processar com parsed.data
}
```

### Errors Recuperáveis

Log e recupere, não propague:

```typescript
try {
  await riskyOperation();
} catch (error) {
  forgeDebug({ 
    scope: 'my-module', 
    level: 'warn', 
    message: 'Operation failed but continuing', 
    context: { error } 
  });
  return defaultValue;
}
```

### Errors Fatais

Propage após logar:

```typescript
async function criticalOperation() {
  try {
    await mightFail();
  } catch (error) {
    forgeDebug({ 
      scope: 'my-module', 
      level: 'error', 
      message: 'Critical failure', 
      context: { error } 
    });
    throw error;
  }
}
```

## Database

### Schema

Schema definido em `apps/forge/src/database/schema.ts` com Drizzle.

### Migrations

```bash
# Gerar migration
npm run db:generate

# Aplicar migrations
npm run db:migrate

# Ver status
npm run db:status
```

### Queries

```typescript
import { eq, desc, and, gte } from 'drizzle-orm';
import { agents, agentExecutionSteps } from './schema';

// Query simples
const allAgents = await db.select().from(agents);

// Com filtros
const activeAgents = await db.select().from(agents)
  .where(eq(agents.status, 'active'));

// Com ordenação
const recentSteps = await db.select().from(agentExecutionSteps)
  .where(eq(agentExecutionSteps.agentId, agentId))
  .orderBy(desc(agentExecutionSteps.createdAt))
  .limit(100);

// Com join
const agentWithRole = await db.select({
  agent: agents,
  role: agentRoles,
}).from(agents).innerJoin(agentRoles, eq(agents.roleId, agentRoles.id));
```

## Testes

### Estrutura

```typescript
// my-module.test.ts
import { describe, it, expect, vi } from 'vitest';
import { myFunction } from './my-module';

describe('myFunction', () => {
  it('should return correct value', async () => {
    const result = await myFunction('input');
    expect(result).toBe('expected');
  });

  it('should handle errors gracefully', async () => {
    vi.mock('./dependency', () => ({
      fetchData: vi.fn().mockRejectedValue(new Error('Network error')),
    }));
    
    const result = await myFunction('input');
    expect(result).toBeNull();
  });
});
```

### mocks

```typescript
import { vi } from 'vitest';

const mockStore = {
  getExecutionState: vi.fn().mockResolvedValue('idle'),
  setExecutionState: vi.fn().mockResolvedValue(undefined),
};

// Usar com spread
const runner = new AgentRunner({
  ...runtime,
  store: mockStore,
});
```

## Commit Messages

```
tipo(scope): descrição

Tipos:
- feat: nova funcionalidade
- fix: correção de bug
- refactor: refatoração
- test: adicionar/modificar testes
- docs: documentação
- chore: manutenção

Exemplos:
feat(agents): add agent hiring workflow
fix(discord): handle invalid token gracefully
refactor(routes): extract schemas to separate module
test(agent-runner): add coverage for error handling
docs(api): update endpoint documentation
```
