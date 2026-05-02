# Padrões Arquiteturais

## Padrões Encontrados

### 1. Store Pattern

Stores são objetos que gerenciam estado e operações relacionadas a um domínio específico.

```typescript
// Store de capabilities
interface CapabilityStore {
  async getRole(roleId: string): Promise<AgentRole | null>;
  async listPermissions(roleId: string): Promise<string[]>;
  async addPermission(roleId: string, toolId: string): Promise<void>;
}

// Store de contratos
interface AgentContractStore {
  async getContract(contractId: string): Promise<Contract | null>;
  async createContract(contract: ContractInput): Promise<Contract>;
  async deductBudget(contractId: string, amount: number): Promise<void>;
}
```

### 2. Factory Pattern

Stores são criados via factories que recebem dependências:

```typescript
export function createCapabilityStore(db: Database): CapabilityStore {
  return {
    async getRole(roleId: string) {
      const result = await db.select().from(agentRoles)
        .where(eq(agentRoles.id, roleId));
      return result[0] ?? null;
    },
    // ...
  };
}
```

### 3. Registry Pattern

O registry mantém referências a objetos:

```typescript
class InternalAgentRegistry {
  private runtimes = new Map<string, InternalAgentRuntime>();
  
  add(runtime: InternalAgentRuntime): void {
    this.runtimes.set(runtime.id, runtime);
  }
  
  remove(agentId: string): void {
    const runtime = this.runtimes.get(agentId);
    if (runtime) {
      runtime.dispose();
      this.runtimes.delete(agentId);
    }
  }
  
  get(agentId: string): InternalAgentRuntime | null {
    return this.runtimes.get(agentId) ?? null;
  }
  
  list(): InternalAgentRuntime[] {
    return Array.from(this.runtimes.values());
  }
}
```

### 4. Builder Pattern

Usado para construir objetos complexos:

```typescript
interface AgentRuntimeBuilder {
  withAgent(agent: Agent): AgentRuntimeBuilder;
  withProviders(providers: Provider[]): AgentRuntimeBuilder;
  withTools(tools: Tool[]): AgentRuntimeBuilder;
  withMemory(memory: Memory): AgentRuntimeBuilder;
  build(): InternalAgentRuntime;
}
```

### 5. Singleton Pattern

O registry é um singleton global:

```typescript
let _registry: InternalAgentRegistry | null = null;

export function getInternalAgentRegistry(): InternalAgentRegistry {
  if (!_registry) {
    _registry = new InternalAgentRegistry();
  }
  return _registry;
}
```

### 6. Repository Pattern

Abstrai acesso ao banco:

```typescript
interface AgentRepository {
  async findById(id: string): Promise<Agent | null>;
  async findAll(): Promise<Agent[]>;
  async create(agent: AgentInput): Promise<Agent>;
  async update(id: string, data: Partial<Agent>): Promise<Agent>;
  async delete(id: string): Promise<void>;
}
```

### 7. Strategy Pattern

Providers usam estratégias diferentes:

```typescript
interface MessageFilterStrategy {
  shouldProcess(message: Message): boolean;
}

class DiscordFilter implements MessageFilterStrategy {
  shouldProcess(msg: Message): boolean {
    return this.isConfiguredChannel(msg.channelId) &&
           this.matchesMentionRequirement(msg);
  }
}
```

### 8. Observer Pattern

O scheduler observa e notifica:

```typescript
interface SchedulerObserver {
  onStepScheduled(agentId: string, nextStepAt: number): void;
  onStepCompleted(agentId: string): void;
  onScheduleError(agentId: string, error: Error): void;
}
```

### 9. Decorator Pattern

Logs decoram operações:

```typescript
function withLogging<T>(
  fn: () => Promise<T>,
  scope: string
): () => Promise<T> {
  return async () => {
    forgeDebug({ scope, level: 'debug', message: 'starting' });
    const result = await fn();
    forgeDebug({ scope, level: 'debug', message: 'completed' });
    return result;
  };
}
```

### 10. Service Layer Pattern

Separa lógica de negócio:

```typescript
// Admin Routes (presentation)
async function handleCreateAgent(req: Request): Promise<Response> {
  const parsed = createAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.message } };
  }
  
  // Delegate to service
  const agent = await agentService.createAgent(parsed.data);
  return { status: 200, body: { data: agent } };
}

// Service (business logic)
export const agentService = {
  async createAgent(input: CreateAgentInput): Promise<Agent> {
    const role = await capabilities.getRole(input.roleId);
    if (!role) throw new Error('Role not found');
    
    const agent = await db.insert(agents).values({...});
    return agent;
  }
};
```

## Anti-Patterns Identificados

### 1. God Object

O `routes.ts` (~1348 linhas) e `github/manager.ts` (~1477 linhas) são muito grandes.

### 2. Primitive Obsession

Strings e numbers são usados em vez de types específicos.

### 3. Duplicate Code

Constants duplicadas em múltiplos arquivos.

### 4. Switch Statements

Switches longos em vez de polimorfismo.

## Recomendações

1. **Extrair modules** de arquivos muito grandes
2. **Criar types** para domains específicos
3. **Consolidar constants** em um arquivo central
4. **Usar strategy** em vez de switches
5. **Adicionar testes** para arquivos críticos
