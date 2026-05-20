# Arquitetura do Ad Product Forge

> **Baseado em:** Código fonte + Issue #237 (fan-out architecture)  
> **Última atualização:** 27/03/2026  
> **Autora:** Wiki Witch Writa

## Visão de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ARQUITETURA FORGE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐   │
│   │ Forge-Admin  │◄───────►│    Forge     │◄───────►│   Database   │   │
│   │  (Next.js)   │  REST   │  (Runtime)   │         │  (SQLite)    │   │
│   └──────────────┘         └──────────────┘         └──────────────┘   │
│                                  │                                       │
│                                  │ Tools                                 │
│                                  ▼                                       │
│                        ┌──────────────────────┐                         │
│                        │    MASTRA ENGINE     │                         │
│                        │   (Agent Runtime)    │                         │
│                        └──────────────────────┘                         │
│                                  │                                       │
│           ┌──────────────────────┼──────────────────────┐              │
│           │                      │                      │              │
│           ▼                      ▼                      ▼              │
│   ┌───────────────┐      ┌───────────────┐      ┌───────────────┐      │
│   │  GitHub Tool  │      │ Coolify Tools │      │  Chat Tools   │      │
│   └───────────────┘      └───────────────┘      └───────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Stack Tecnológica

| Camada     | Tecnologia        | Propósito          |
| ---------- | ----------------- | ------------------ |
| Frontend   | Next.js 14        | Admin UI           |
| Backend    | Node.js + Express | API REST           |
| Runtime    | Mastra            | Agent execution    |
| ORM        | Drizzle           | Database           |
| Database   | SQLite (Turso)    | Persistent storage |
| Deployment | Coolify           | Hosting + CI/CD    |

## Estrutura de Diretórios

```
ad-product-forge/
├── apps/
│   ├── forge/                    # Backend principal
│   │   ├── src/
│   │   │   ├── admin/
│   │   │   │   └── routes.ts     # API endpoints
│   │   │   ├── agents/
│   │   │   │   ├── agent-contract-store.ts
│   │   │   │   ├── adjust-agent-contract-budget.ts
│   │   │   │   └── *.ts
│   │   │   ├── capabilities/
│   │   │   │   └── catalog.ts    # Tools e permissions
│   │   │   ├── database/
│   │   │   │   ├── schema.ts     # Drizzle schema
│   │   │   │   └── index.ts
│   │   │   ├── finance/
│   │   │   │   ├── company-cash-ledger.ts
│   │   │   │   └── company-cash-operations.ts
│   │   │   ├── tools/            # Ferramentas do agente
│   │   │   ├── workflows/        # Workflows de negócio
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── forge-admin/              # Frontend admin
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   └── (routes)/
│   │   │   ├── features/
│   │   │   │   ├── agents/
│   │   │   │   ├── contracts/
│   │   │   │   ├── roles/
│   │   │   │   └── integrations/
│   │   │   └── components/
│   │   └── package.json
│   │
│   └── mastra-engine/            # Runtime de agentes
│       └── src/
│
├── packages/                     # Shared packages
│
├── docs/                         # Documentação
│   └── ad-product-forge/
│       ├── guias/
│       ├── referencias/
│       └── faq/
│
├── docker-compose.yml            # Desenvolvimento local
├── turbo.json                    # Monorepo config
└── package.json                  # Root package
```

## Fluxo de Dados Principal

### 1. Requisição Admin → Agent

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO: ADMIN → AGENT                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Forge-Admin                                                     │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  fetch('/admin/agent/contract/adjust-budget', {        │     │
│  │    method: 'POST',                                      │     │
│  │    body: { agentId, newBudgetUsd }                      │     │
│  │  })                                                     │     │
│  └─────────────────────────────────────────────────────────┘     │
│                            │                                      │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                 POST /admin/agent/contract/adjust-budget │     │
│  └─────────────────────────────────────────────────────────┘     │
│                            │                                      │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  adjustAgentContractBudget()                           │     │
│  │  1. Validações (cash, estado)                           │     │
│  │  2. Atualiza company_cash_ledger                        │     │
│  │  3. Atualiza agent_execution_contracts                  │     │
│  │  4. Retorna resultado                                    │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Execução de Agent

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO: EXECUÇÃO AGENTE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              MASTRA ENGINE                                │    │
│  │                                                          │    │
│  │  1. Loop de Execução                                     │    │
│  │     while (contract.active && !stopped) {                │    │
│  │       task = await getNextTask()                         │    │
│  │       result = await executeTask(task)                    │    │
│  │       await recordExecution(result)                       │    │
│  │       await checkBudget()                                 │    │
│  │     }                                                    │    │
│  │                                                          │    │
│  │  2. Tool Execution                                       │    │
│  │     agent.use(list_contacts, {})                         │    │
│  │          │                                                │    │
│  │          ▼                                                │    │
│  │     capabilityRegistry.execute('list_contacts', ctx)     │    │
│  │          │                                                │    │
│  │          ▼                                                │    │
│  │     // Verifica permissions antes de executar            │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Modelo de Dados

### Entidades Principais

```
┌─────────────────────────────────────────────────────────────────┐
│                         ENTIDADES                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐                   │
│  │ agents          │      │ agent_functions  │                  │
│  ├─────────────────┤      ├─────────────────┤                   │
│  │ id              │──┐   │ id              │                   │
│  │ name            │  │   │ name            │                   │
│  │ description     │  │   │ description     │                   │
│  │ status          │  │   │ status          │                   │
│  │ createdAt       │  │   │ capabilities    │                   │
│  └─────────────────┘  │   │ createdAt       │                   │
│                       │   └─────────────────┘                   │
│                       │                                          │
│  ┌─────────────────┐  │   ┌─────────────────┐                   │
│  │agent_execution  │◄─┘   │ agent_roles     │                   │
│  │_contracts       │      ├─────────────────┤                   │
│  ├─────────────────┤      │ id              │                   │
│  │ id              │      │ name            │                   │
│  │ agentId ────────┼──────│ permissions     │                   │
│  │ budgetUsd       │      │ capabilities    │                   │
│  │ spentUsd        │      └─────────────────┘                   │
│  │ startsAt        │                                            │
│  │ endsAt          │      ┌─────────────────┐                    │
│  │ executionState   │      │ company_cash   │                   │
│  └─────────────────┘      ├─────────────────┤                   │
│                           │ id              │                   │
│  ┌─────────────────┐      │ balanceUsd      │                   │
│  │company_cash     │◄─────│ currency        │                   │
│  │_ledger          │      └─────────────────┘                   │
│  ├─────────────────┤                                           │
│  │ id              │                                           │
│  │ balanceUsd      │                                           │
│  │ currency        │                                           │
│  │ updatedAt       │                                           │
│  └─────────────────┘                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Agentes

| Método | Endpoint                     | Descrição              |
| ------ | ---------------------------- | ---------------------- |
| `GET`  | `/admin/agents`              | Lista todos os agentes |
| `GET`  | `/admin/agent/:id`           | Detalhes de um agente  |
| `POST` | `/admin/agent/hire`          | Contrata novo agente   |
| `POST` | `/admin/agent/:id/terminate` | Encerra agente         |

### Contratos

| Método | Endpoint                              | Descrição        |
| ------ | ------------------------------------- | ---------------- |
| `GET`  | `/admin/agent/contracts`              | Lista contratos  |
| `GET`  | `/admin/agent/:id/contract`           | Contrato atual   |
| `POST` | `/admin/agent/contract/adjust-budget` | Ajusta orçamento |
| `POST` | `/admin/agent/contract/top-up`        | Adiciona fundos  |

### Permissões

| Método | Endpoint                      | Descrição           |
| ------ | ----------------------------- | ------------------- |
| `GET`  | `/admin/roles`                | Lista roles         |
| `POST` | `/admin/roles`                | Cria role           |
| `GET`  | `/admin/role/:id/permissions` | Permissões do role  |
| `PUT`  | `/admin/role/:id/permissions` | Atualiza permissões |

### Integrações

| Método | Endpoint                           | Descrição          |
| ------ | ---------------------------------- | ------------------ |
| `GET`  | `/admin/integrations/github/repos` | Lista repos GitHub |
| `GET`  | `/admin/integrations/coolify/apps` | Lista apps Coolify |

## Segurança

### Camadas de Proteção

```
┌─────────────────────────────────────────────────────────────────┐
│                       SEGURANÇA                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │   AUTH      │ → │ PERMISSIONS │ → │  VALIDATION │          │
│  │  (Who?)      │   │  (Can?)     │   │  (How?)     │          │
│  └─────────────┘   └─────────────┘   └─────────────┘          │
│                                                                  │
│  1. Auth: Verify identity via session/API key                   │
│  2. Permissions: Check role capabilities                        │
│  3. Validation: Sanitize and validate inputs                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Validação de Budget

```typescript
// Antes de qualquer operação financeira:

async function validateBudgetOperation(
  db: Database,
  agentId: string,
  amount: number,
  operation: 'increase' | 'decrease'
) {
  // 1. Verificar se agente existe
  const agent = await db.query.agents.findFirst({...});

  // 2. Verificar se contrato existe e está ativo
  const contract = await db.query.agentExecutionContracts.findFirst({...});

  // 3. Para increase: verificar cash disponível
  if (operation === 'increase') {
    const cash = await companyCash.getCurrentBalanceUsd();
    if (cash < amount) throw new Error('Insufficient cash');
  }

  // 4. Para decrease: verificar se novo budget >= spent
  if (operation === 'decrease') {
    if (newBudget < contract.spentUsd) {
      throw new Error('Cannot reduce below spent amount');
    }
  }

  // 5. Transação atômica
  await db.transaction(async (tx) => {
    // Updates...
  });
}
```

## Deployment

### Coolify Configuration

```yaml
# docker-compose.yml (fragmento)
services:
  forge:
    image: ghcr.io/alternative-down/ad-product-forge/forge:latest
    environment:
      DATABASE_URL: ${DATABASE_URL}
      GITHUB_APP_ID: ${GITHUB_APP_ID}
      GITHUB_APP_PRIVATE_KEY: ${GITHUB_APP_PRIVATE_KEY}
    ports:
      - '3001:3001'

  forge-admin:
    image: ghcr.io/alternative-down/ad-product-forge/forge-admin:latest
    environment:
      NEXT_PUBLIC_API_URL: ${API_URL}
    ports:
      - '3000:3000'
```

### Environment Variables

| Variável                 | Descrição                | Exemplo             |
| ------------------------ | ------------------------ | ------------------- |
| `DATABASE_URL`           | Connection string SQLite | `file:./forge.db`   |
| `GITHUB_APP_ID`          | GitHub App ID            | `123456`            |
| `GITHUB_APP_PRIVATE_KEY` | Chave privada do App     | `-----BEGIN RSA...` |
| `COMPANY_CASH_INITIAL`   | Saldo inicial da empresa | `10000`             |

---

**Tags:** `architecture` `technical` `overview`
