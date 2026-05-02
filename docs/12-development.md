# Development

## Setup

### Prerequisites

- Node.js 20+
- npm or pnpm
- SQLite (or Turso for dev)

### Installation

```bash
git clone https://github.com/alternative-down/ad-product-forge.git
cd ad-product-forge
npm install

# Create .env
cp .env.example .env

# Generate ENCRYPTION_KEY
openssl rand -base64 32
# Put in .env as ENCRYPTION_KEY=xxx
```

### Minimum Environment Variables

```bash
ENCRYPTION_KEY=<32-byte-base64-key>
DATABASE_URL=file:./data/forge.db
FORGE_DATA_PATH=./data
WORKSPACE_BASE_PATH=./workspaces
HTTP_PORT=3000
```

### Run

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

### Tests

```bash
# All tests
npm test

# Module tests
npm test -- --grep "agent-runner"

# Coverage
npm run test:coverage

# Watch mode
npm test -- --watch
```

## Branching

```
main           → Production (only via stage)
stage          → Staging
develop        → Integration
fix/xxx        → Fixes
feat/xxx       → Features
docs/xxx       → Documentation
```

### Workflow

1. Create branch from updated `develop`
2. Develop
3. Open PR to `develop`
4. Wait for approval + tests
5. Veritas merges

## Code Patterns

### TypeScript

- Use explicit types in public functions
- Interfaces for contracts between modules
- Types for unions and intersections

### Naming

- Files: kebab-case (`agent-runner.ts`)
- Functions: camelCase (`createAgent`, `loadProviders`)
- Interfaces/Types: PascalCase (`AgentRuntime`)
- Constants: SCREAMING_CASE (`ONE_MINUTE_MS`)

### Functions

- Small functions (< 50 lines)
- Single responsibility
- Early return for errors

### Async/Await

- Prefer async/await over .then()
- Don't mix styles

```typescript
// Good
const result = await fetchData();
const processed = await processData(result);

// Bad
fetchData().then(result => {
  processData(result).then(processed => { ... });
});
```

## Logging

```typescript
import { forgeDebug } from '@forge-runtime/core';

forgeDebug({
  scope: 'module-name',
  level: 'error',
  message: 'Description',
  context: { data: 'value' },
});
```

Levels: `debug`, `info`, `warn`, `error`

## Error Handling

### Validation

Zod schemas for input validation:

```typescript
import { z } from 'zod';

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  roleId: z.string().uuid(),
});

function handleCreateAgent(input: unknown) {
  const parsed = createAgentSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.message } };
  }
}
```

### Recoverable Errors

Log and recover, don't propagate:

```typescript
try {
  await riskyOperation();
} catch (error) {
  forgeDebug({ scope: 'module', level: 'warn', message: 'Failed but continuing', context: { error } });
  return defaultValue;
}
```

### Fatal Errors

Propagate after logging:

```typescript
try {
  await mightFail();
} catch (error) {
  forgeDebug({ scope: 'module', level: 'error', message: 'Critical failure', context: { error } });
  throw error;
}
```

## Database

### Schema

Defined in `apps/forge/src/database/schema.ts` with Drizzle.

### Migrations

```bash
npm run db:generate
npm run db:migrate
npm run db:status
```

### Queries

```typescript
import { eq, desc } from 'drizzle-orm';
import { agents } from './schema';

// Simple query
const allAgents = await db.select().from(agents);

// With filters
const activeAgents = await db.select().from(agents)
  .where(eq(agents.status, 'active'));

// With ordering
const recentSteps = await db.select().from(agentExecutionSteps)
  .where(eq(agentExecutionSteps.agentId, agentId))
  .orderBy(desc(agentExecutionSteps.createdAt))
  .limit(100);
```

## Testing

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('myFunction', () => {
  it('should return correct value', async () => {
    const result = await myFunction('input');
    expect(result).toBe('expected');
  });
});

const mockStore = {
  getExecutionState: vi.fn().mockResolvedValue('idle'),
};
```

## Commit Messages

```
type(scope): description

Types:
- feat: new feature
- fix: bug fix
- refactor: refactoring
- test: add/modify tests
- docs: documentation
- chore: maintenance
```
