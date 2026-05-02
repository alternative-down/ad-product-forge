# Runtime do Agente

## O que é o Runtime

O **runtime** é a instância em execução de um agente. Ele encapsula todo o estado e comportamento necessário para o agente operar.

## Estrutura do Runtime

```typescript
interface InternalAgentRuntime {
  // Identificação
  id: string;                          // Agent UUID
  agentId: string;                     // Reference to DB agent
  
  // Configuração
  agent: Agent;                       // Agent record from DB
  role: AgentRole;                    // Role with permissions
  
  // Componentes
  runner: AgentRunner;                // Execution loop
  store: AgentStore;                 // State management
  providers: CommunicationProvider[]; // Communication channels
  
  // LTM
  ltm: AgentLongTermMemory;          // Long-term memory
  
  // Status
  status: 'idle' | 'running' | 'absent';
}
```

## AgentRunner

O **AgentRunner** orchestra a execução do agente.

```typescript
// apps/forge/src/agents/agent-runner.ts
class AgentRunner {
  private runtime: InternalAgentRuntime;
  private store: AgentStore;
  private options: RunnerOptions;
  
  async beginRun(): Promise<void> {
    // Inicializar contexto
    // Carregar providers
    // Verificar health
  }
  
  async nextStep(options?: StepOptions): Promise<StepResult> {
    // 1. Verificar budget
    // 2. Carregar contexto (LTM + providers)
    // 3. Gerar resposta via LLM
    // 4. Executar tools se necessário
    // 5. Atualizar LTM
    // 6. Logar step
    // 7. Retornar resultado
  }
  
  async endRun(): Promise<void> {
    // Limpar recursos
    // Finalizar providers
  }
  
  async healthcheck(): Promise<boolean> {
    // Verificar se LLM responde
    // Verificar providers
    // Verificar store
  }
}
```

## StepOptions

```typescript
interface StepOptions {
  locale?: string;
  conversationKey?: string;
  triggerType?: 'schedule' | 'message' | 'manual';
  inboundMessage?: CommunicationInboundMessage;
}
```

## StepResult

```typescript
interface StepResult {
  messages: RuntimeMessage[];
  isDone: boolean;
  metrics: {
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  };
}
```

## Fluxo de Execução

```
nextStep() called
     │
     ▼
┌────────────────────────────┐
│ 1. Verificar Budget         │
│    - Contrato ativo?       │
│    - Budget disponível?    │
└────────────────────────────┘
     │
     ▼
┌────────────────────────────┐
│ 2. Carregar Contexto        │
│    - LTM checkpoint        │
│    - Providers             │
│    - Working memory        │
└────────────────────────────┘
     │
     ▼
┌────────────────────────────┐
│ 3. Gerar Resposta          │
│    - Montar prompt         │
│    - Enviar para LLM       │
│    - Receber resposta      │
└────────────────────────────┘
     │
     ▼
    ┌────────────────────────────┐
    │ 4. Interpretar Resposta     │
    │    - text → response       │
    │    - tool_call → execute   │
    │    - done → finalize       │
    └────────────────────────────┘
     │
     ▼
┌────────────────────────────┐
│ 5. Executar Tools          │
│    - Verificar permission  │
│    - Validar input         │
│    - Executar handler      │
└────────────────────────────┘
     │
     ▼
┌────────────────────────────┐
│ 6. Atualizar Estado        │
│    - Checkpoint LTM        │
│    - Notificar providers   │
└────────────────────────────┘
     │
     ▼
┌────────────────────────────┐
│ 7. Logar Step              │
│    - inputTokens           │
│    - outputTokens          │
│    - durationMs            │
│    - Deduzir budget        │
└────────────────────────────┘
     │
     ▼
   Return StepResult
```

## Criar Runtime

```typescript
// apps/forge/src/agents/agent-runtime-platform.ts
export async function createAgentRuntime(
  config: AgentRuntimeConfig
): Promise<InternalAgentRuntime> {
  // 1. Buscar agente no banco
  const agent = await db.select().from(agents)
    .where(eq(agents.id, config.agentId));
  
  // 2. Buscar role
  const role = await db.select().from(agentRoles)
    .where(eq(agentRoles.id, agent.roleId));
  
  // 3. Descriptografar credentials dos providers
  const providerCredentials = await loadProviderCredentials(db, config.agentId);
  
  // 4. Carregar providers
  const providers = await loadCommunicationProviders(providerCredentials);
  
  // 5. Criar store
  const store = createAgentStore({
    agentId: config.agentId,
    db,
  });
  
  // 6. Criar LTM
  const ltm = await createAgentLongTermMemory({
    agentId: config.agentId,
    workspacePath: agent.workspacePath,
  });
  
  // 7. Criar runner
  const runner = new AgentRunner({
    runtime: {
      id: config.agentId,
      agentId: config.agentId,
      agent,
      role: role[0],
      providers,
      ltm,
    },
    store,
    options: config.options,
  });
  
  return {
    id: config.agentId,
    agentId: config.agentId,
    agent,
    role: role[0],
    runner,
    store,
    providers,
    ltm,
    status: 'idle',
  };
}
```

## Loop de Execução

```typescript
// Loop principal do AgentRunner
async nextStep(options?: StepOptions): Promise<StepResult> {
  try {
    // Verificar budget
    const budgetOk = await this.checkBudget();
    if (!budgetOk) {
      return { isDone: true, messages: [], metrics: {...} };
    }
    
    // Carregar contexto
    const context = await this.loadContext();
    
    // Gerar
    const response = await this.generate(context, options);
    
    // Processar resposta
    const result = await this.processResponse(response);
    
    // Atualizar estado
    await this.updateState(result);
    
    // Logar
    await this.logStep(result.metrics);
    
    return result;
  } catch (error) {
    forgeDebug({
      scope: 'agent-runner',
      level: 'error',
      message: 'Step failed',
      context: { error }
    });
    throw error;
  }
}
```

## Health Check

```typescript
async healthcheck(): Promise<boolean> {
  try {
    // 1. Verificar store
    const storeOk = await this.store.healthcheck();
    if (!storeOk) return false;
    
    // 2. Verificar providers
    for (const provider of this.providers) {
      const ok = await provider.healthcheck?.();
      if (!ok) return false;
    }
    
    // 3. Verificar LLM (teste simples)
    const llmOk = await this.testLlm();
    if (!llmOk) return false;
    
    return true;
  } catch {
    return false;
  }
}
```

## Timeout e Loop Detection

```typescript
interface RunnerOptions {
  maxStepDurationMs?: number;    // Timeout por step (default: 5 min)
  maxLoopIterations?: number;    // Max iterations sem progresso
  loopDetectionThreshold?: number; // Threshold para detectar loop
}

class AgentRunner {
  private stepStartTime = 0;
  private iterationsWithoutProgress = 0;
  
  async nextStep(options?: StepOptions): Promise<StepResult> {
    this.stepStartTime = Date.now();
    
    // Loop detection
    if (this.iterationsWithoutProgress >= this.options.maxLoopIterations) {
      throw new Error('Infinite loop detected');
    }
    
    // Timeout check
    const elapsed = Date.now() - this.stepStartTime;
    if (elapsed > this.options.maxStepDurationMs) {
      throw new Error('Step timeout exceeded');
    }
    
    // ... rest of logic
  }
}
```

## Disposição

```typescript
async dispose(): Promise<void> {
  // 1. Parar runner
  await this.runner.endRun();
  
  // 2. Dispor providers
  for (const provider of this.providers) {
    await provider.dispose();
  }
  
  // 3. Dispor LTM
  await this.ltm.dispose();
  
  // 4. Limpar store
  await this.store.clear();
}
```
