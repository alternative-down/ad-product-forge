# Testes

## Framework

Vitest é usado para testes.

```bash
npm test                    # Rodar todos
npm test -- --grep pattern  # Filtrar por pattern
npm test -- --watch        # Modo watch
npm run test:coverage      # Com coverage
```

## Estrutura de Testes

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('AgentRunner', () => {
  let runner: AgentRunner;
  
  beforeEach(() => {
    runner = new AgentRunner(mockConfig);
  });
  
  it('should execute nextStep', async () => {
    const result = await runner.nextStep();
    expect(result.isDone).toBe(false);
  });
});
```

## Mocks

```typescript
// Mock store
const mockStore = {
  getExecutionState: vi.fn().mockResolvedValue('idle'),
  saveState: vi.fn().mockResolvedValue(undefined),
};

// Mock providers
const mockDiscord = {
  sendMessage: vi.fn().mockResolvedValue({ success: true }),
  dispose: vi.fn().mockResolvedValue(undefined),
};

// Mock database
vi.mock('../database/client', () => ({
  db: {
    select: vi.fn().mockReturnValue(mockQuery),
    insert: vi.fn().mockReturnValue(mockMutation),
  }
}));
```

## Testar API Routes

```typescript
import { createTestRequest } from '../test-utils';

describe('POST /admin/agent', () => {
  it('should create agent', async () => {
    const response = await createTestRequest({
      method: 'POST',
      path: '/admin/agent',
      body: {
        name: 'Test Agent',
        roleId: 'role-uuid',
        workspacePath: './workspaces/test',
      },
    });
    
    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Test Agent');
  });
});
```

## Cobertura

```bash
npm run test:coverage
```

Mínimo recomendado:
- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

## Test Files

| Arquivo | O que testar |
|---------|--------------|
| `*.test.ts` | Lógica de negócio |
| `*.test.ts` em `__tests__/` | Testes de integração |
| `*.test.ts` em `.test/` | Testes e2e |

## Boas Práticas

1. **Testar comportamento**, não implementação
2. **Nomes descritivos** para testes
3. **Arrange-Act-Assert** pattern
4. **Um conceito** por teste
5. **Mocks** para dependências externas
