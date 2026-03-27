# API Reference - ad-product-forge

> **Fonte**: Baseado no código fonte em `apps/forge/src/admin/routes.ts`
> **Última atualização**: 27/03/2026
> **Status**: Documentação em progresso

Esta referência documenta todos os endpoints da API administrativa do ad-product-forge. Todos os endpoints estão sob o prefixo `/admin`.

## Autenticação e Headers

Todos os endpoints requerem os seguintes headers:

```http
Content-Type: application/json
X-Request-Id: <uuid> (opcional)
```

---

## Endpoints GET (Consultas)

### Visão Geral

#### `GET /admin/overview`

Retorna uma visão geral do sistema, incluindo estatísticas de agents, contratos e financeiro.

**Resposta**:
```json
{
  "agents": { ... },
  "contracts": { ... },
  "finance": { ... }
}
```

---

### Agents

#### `GET /admin/agents`

Lista todos os agents ativos no sistema.

**Query Parameters**:
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `status` | `string` | Filtrar por status (opcional) |

**Resposta**: Array de agents com seus contratos e status.

---

#### `GET /admin/agent`

Retorna detalhes de um agent específico.

**Query Parameters**:
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `agentId` | `string` | ID do agent (obrigatório) |

**Resposta**:
```json
{
  "id": "agent_xxx",
  "name": "Nome do Agent",
  "status": "running",
  "contract": { ... }
}
```

---

### Funções e Papéis

#### `GET /admin/functions`

Lista todas as funções disponíveis no sistema.

**Resposta**: Array de funções com suas descrições e permissões.

---

#### `GET /admin/roles`

Lista todos os roles/papéis configurados.

**Resposta**: Array de roles com suas permissões de tools e workflows.

---

### Sistema

#### `GET /admin/system/integrations`

Lista todas as integrações configuradas (GitHub, Slack, Migadu, Coolify).

**Resposta**:
```json
{
  "github": { ... },
  "slack": { ... },
  "migadu": { ... },
  "coolify": { ... }
}
```

---

#### `GET /admin/system/settings`

Retorna as configurações gerais do sistema.

**Resposta**:
```json
{
  "companyName": "Nome da Empresa",
  "companyContext": "Contexto da empresa para agentes"
}
```

---

#### `GET /admin/system/llm`

Retorna configurações de LLM, incluindo profiles e preços de modelos.

**Resposta**:
```json
{
  "profiles": [ ... ],
  "modelPrices": [ ... ],
  "defaults": { ... }
}
```

---

#### `GET /admin/system/migrations`

Lista migrations pendentes ou já aplicadas.

**Resposta**: Status das migrations do banco de dados.

---

#### `GET /admin/system/oauth`

Retorna status de OAuth para provedores (openai-codex, anthropic).

**Resposta**:
```json
{
  "openai-codex": {
    "connected": true,
    "refreshToken": "***",
    "expiresAt": "2026-04-01T00:00:00Z",
    "accountId": "user_xxx"
  },
  "anthropic": { ... }
}
```

---

### Financeiro

#### `GET /admin/finance`

Retorna overview financeiro: investimentos, payables, ledger e cash balance.

**Resposta**:
```json
{
  "investments": [ ... ],
  "payables": [ ... ],
  "ledger": [ ... ],
  "cashBalance": 10000.00
}
```

---

## Endpoints POST (Ações)

### Agent Lifecycle

#### `POST /admin/agent/hire`

Contrata um novo agent no sistema.

**Body**:
```json
{
  "agentId": "agent_xxx",
  "functionId": "func_xxx",
  "name": "Nome do Agent",
  "instructions": "Instruções do agent...",
  "budget": 1000.00,
  "modelProfileId": "profile_xxx",
  "workspaceEnabled": true,
  "toolPermissions": ["tool_xxx", "tool_yyy"]
}
```

**Fluxo interno**: `runInternalHiring()`

**Resposta**:
```json
{
  "success": true,
  "agent": { ... },
  "contract": { ... }
}
```

---

#### `POST /admin/agent/terminate`

Termina o contrato de um agent.

**Body**:
```json
{
  "agentId": "agent_xxx",
  "reason": "Motivo da rescisão"
}
```

**Fluxo interno**: `runInternalTermination()`

**Resposta**:
```json
{
  "success": true,
  "refundAmount": 250.00
}
```

---

#### `POST /admin/agent/wake`

Acorda um agent manualmente (trigger evento de wake).

**Body**:
```json
{
  "agentId": "agent_xxx"
}
```

**Resposta**:
```json
{
  "success": true,
  "message": "Wake event triggered"
}
```

---

#### `POST /admin/agent/reload`

Recarrega as configurações de um agent (inclui registry de agents).

**Body**:
```json
{
  "agentId": "agent_xxx"
}
```

**Resposta**:
```json
{
  "success": true,
  "message": "Agent reloaded"
}
```

---

### Contrato e Budget

#### `POST /admin/agent/contract/top-up`

Adiciona fundos a um contrato existente (refill).

**Body**:
```json
{
  "agentId": "agent_xxx",
  "amount": 500.00
}
```

**Validações**:
- Amount deve ser > 0
- Empresa deve ter cash balance suficiente

**Resposta**:
```json
{
  "success": true,
  "newBalance": 1500.00,
  "transactionId": "txn_xxx"
}
```

---

#### `POST /admin/agent/contract/adjust-budget`

Ajusta o budget máximo de um contrato (aumento ou redução).

**Body**:
```json
{
  "agentId": "agent_xxx",
  "newBudget": 2000.00
}
```

**Validações**:
- Se agent estiver em execução: redução não permitida
- Novo budget deve ser >= valor já gasto
- Para aumentos: empresa deve ter cash balance suficiente

**Resposta**:
```json
{
  "success": true,
  "previousBudget": 1000.00,
  "newBudget": 2000.00,
  "refundAmount": 0.00
}
```

**Ferramenta associada**: `adjust_agent_contract_budget` (requer role `finance`)

---

#### `POST /admin/agent/change-function`

Altera a função de um agent.

**Body**:
```json
{
  "agentId": "agent_xxx",
  "functionId": "func_yyy"
}
```

**Resposta**:
```json
{
  "success": true,
  "previousFunction": "func_xxx",
  "newFunction": "func_yyy"
}
```

---

#### `POST /admin/agent/update-config`

Atualiza configurações de um agent.

**Body**:
```json
{
  "agentId": "agent_xxx",
  "name": "Novo Nome",
  "description": "Nova descrição",
  "instructions": "Novas instruções...",
  "workspaceSettings": {
    "enabled": true,
    "autoSave": true
  },
  "modelProfiles": ["profile_xxx"]
}
```

**Resposta**:
```json
{
  "success": true,
  "updatedFields": ["name", "instructions"]
}
```

---

### Agent Provider

#### `POST /admin/agent-provider/upsert`

Adiciona ou atualiza credenciais de provider para agent.

**Body**:
```json
{
  "providerType": "discord" | "email",
  "credentials": {
    "webhookUrl": "https://...",
    "token": "xxx"
  }
}
```

**Armazenamento**: Credenciais são criptografadas antes de armazenar

**Resposta**:
```json
{
  "success": true,
  "providerType": "discord"
}
```

---

#### `POST /admin/agent-provider/delete`

Remove credenciais de provider.

**Body**:
```json
{
  "providerType": "discord"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

### Agendamento

#### `POST /admin/agent-schedule/create`

Cria um schedule para um agent.

**Body**:
```json
{
  "agentId": "agent_xxx",
  "name": "Daily Report",
  "scheduleType": "cron" | "date",
  "cronExpression": "0 9 * * *",
  "scheduledDate": "2026-03-28T09:00:00Z",
  "timezone": "America/Sao_Paulo",
  "content": "Execute daily report task",
  "isActive": true
}
```

**Tipos de Schedule**:
- `cron`: Expressão cron (ex: `0 9 * * *` = todo dia às 9h)
- `date`: Data específica (one-time)

**Resposta**:
```json
{
  "success": true,
  "scheduleId": "sched_xxx"
}
```

---

#### `POST /admin/agent-schedule/update`

Atualiza um schedule existente.

**Body**:
```json
{
  "scheduleId": "sched_xxx",
  "name": "Nome Atualizado",
  "cronExpression": "0 10 * * *",
  "timezone": "UTC",
  "content": "Conteúdo atualizado",
  "isActive": false
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

#### `POST /admin/agent-schedule/delete`

Deleta um schedule.

**Body**:
```json
{
  "scheduleId": "sched_xxx"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

### Roles e Permissions

#### `POST /admin/role/create`

Cria um novo role.

**Body**:
```json
{
  "name": "finance_manager",
  "description": "Gerente de finanças"
}
```

**Resposta**:
```json
{
  "success": true,
  "roleId": "role_xxx"
}
```

---

#### `POST /admin/role/update`

Atualiza um role existente.

**Body**:
```json
{
  "roleId": "role_xxx",
  "name": "Novo Nome",
  "description": "Nova descrição"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

#### `POST /admin/role/delete`

Deleta um role.

**Body**:
```json
{
  "roleId": "role_xxx"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

### Funções

#### `POST /admin/function/create`

Cria uma nova função.

**Body**:
```json
{
  "name": "coder",
  "description": "Agente desenvolvedor",
  "instructions": "Você é um desenvolvedor...",
  "icon": "💻"
}
```

**Resposta**:
```json
{
  "success": true,
  "functionId": "func_xxx"
}
```

---

#### `POST /admin/function/update`

Atualiza uma função existente.

**Body**:
```json
{
  "functionId": "func_xxx",
  "name": "Nome Atualizado",
  "description": "Descrição atualizada",
  "instructions": "Novas instruções...",
  "icon": "🔧"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

#### `POST /admin/function/delete`

Deleta uma função.

**Body**:
```json
{
  "functionId": "func_xxx"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

### Associação Role-Function

#### `POST /admin/function-role/add`

Associa um role a uma função.

**Body**:
```json
{
  "functionId": "func_xxx",
  "roleId": "role_xxx"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

#### `POST /admin/function-role/remove`

Remove associação de role de uma função.

**Body**:
```json
{
  "functionId": "func_xxx",
  "roleId": "role_xxx"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

### Permissões de Tools

#### `POST /admin/role-tool-permission/add`

Adiciona permissão de tool a um role.

**Body**:
```json
{
  "roleId": "role_xxx",
  "toolId": "adjust_agent_contract_budget"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

#### `POST /admin/role-tool-permission/remove`

Remove permissão de tool de um role.

**Body**:
```json
{
  "roleId": "role_xxx",
  "toolId": "adjust_agent_contract_budget"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

### Permissões de Workflows

#### `POST /admin/role-workflow-permission/add`

Adiciona permissão de workflow a um role.

**Body**:
```json
{
  "roleId": "role_xxx",
  "workflowId": "hire_agent" | "terminate_agent"
}
```

**Workflows disponíveis**:
- `hire_agent`: Permissão para contratar agents
- `terminate_agent`: Permissão para terminar agents

**Resposta**:
```json
{
  "success": true
}
```

---

#### `POST /admin/role-workflow-permission/remove`

Remove permissão de workflow de um role.

**Body**:
```json
{
  "roleId": "role_xxx",
  "workflowId": "hire_agent"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

### Sistema e Integrações

#### `POST /admin/system/settings/upsert`

Atualiza configurações do sistema.

**Body**:
```json
{
  "companyName": "Alternative Down",
  "companyContext": "Somos uma empresa de micro-saas..."
}
```

**Efeito colateral**: Dispara reload do agent registry

**Resposta**:
```json
{
  "success": true,
  "agentRegistryReloaded": true
}
```

---

#### `POST /admin/system/integration/upsert`

Adiciona ou atualiza uma integração.

**Body**:
```json
{
  "provider": "migadu" | "coolify" | "github" | "slack",
  "credentials": {
    "apiKey": "xxx",
    "endpoint": "https://..."
  }
}
```

**Providers suportados**:
- `migadu`: Email provider
- `coolify`: Deployment platform
- `github`: GitHub integration
- `slack`: Slack integration

**Resposta**:
```json
{
  "success": true,
  "provider": "github"
}
```

---

#### `POST /admin/system/integration/delete`

Remove uma integração.

**Body**:
```json
{
  "provider": "github"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

### LLM Configuration

#### `POST /admin/system/llm/profile/upsert`

Cria ou atualiza um LLM profile.

**Body**:
```json
{
  "profileId": "profile_xxx",
  "name": "GPT-4 Fast",
  "provider": "openai",
  "model": "gpt-4-turbo",
  "contractCostMultiplier": 2.5
}
```

**Campo especial**: `contractCostMultiplier` ajusta o custo do contrato baseado no preço do modelo

**Resposta**:
```json
{
  "success": true,
  "profileId": "profile_xxx"
}
```

---

#### `POST /admin/system/llm/profile/delete`

Deleta um LLM profile.

**Body**:
```json
{
  "profileId": "profile_xxx"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

#### `POST /admin/system/llm/defaults/update`

Atualiza defaults de LLM.

**Body**:
```json
{
  "defaultProfileId": "profile_xxx",
  "defaultModel": "gpt-4-turbo"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

#### `POST /admin/system/llm/price/upsert`

Adiciona ou atualiza preço de modelo LLM.

**Body**:
```json
{
  "provider": "openai",
  "model": "gpt-4-turbo",
  "inputPricePerMillion": 10.00,
  "cacheWritePricePerMillion": 3.50,
  "cacheReadPricePerMillion": 0.30,
  "outputPricePerMillion": 30.00
}
```

**Preços**: Por milhão de tokens em USD

**Resposta**:
```json
{
  "success": true
}
```

---

### OAuth

#### `POST /admin/system/oauth/sync`

Sincroniza OAuth para provedores.

**Body**:
```json
{
  "providerId": "openai-codex" | "anthropic"
}
```

**Ação**: Atualiza tokens de refresh e status de conexão

**Resposta**:
```json
{
  "success": true,
  "connected": true,
  "expiresAt": "2026-04-01T00:00:00Z"
}
```

---

### Financeiro

#### `POST /admin/finance/investment/create`

Registra um investimento do dono.

**Body**:
```json
{
  "amount": 50000.00,
  "source": "owner_equity",
  "notes": "Seed round investment"
}
```

**Resposta**:
```json
{
  "success": true,
  "investmentId": "inv_xxx",
  "newCashBalance": 60000.00
}
```

---

#### `POST /admin/finance/payable/create`

Cria um payable (单次 ou recorrente).

**Body (单次)**:
```json
{
  "type": "single",
  "amount": 100.00,
  "description": "Invoice #123",
  "agentId": "agent_xxx",
  "dueDate": "2026-04-01"
}
```

**Body (recorrente)**:
```json
{
  "type": "recurring",
  "amount": 50.00,
  "description": "Monthly subscription",
  "frequency": "monthly",
  "startDate": "2026-03-01"
}
```

**Resposta**:
```json
{
  "success": true,
  "payableId": "pay_xxx"
}
```

---

#### `POST /admin/finance/ledger/post`

Posta uma entrada planejada no ledger.

**Body**:
```json
{
  "type": "planned_entry",
  "amount": -100.00,
  "description": "Planned expense",
  "executeAt": "2026-04-01T00:00:00Z"
}
```

**Tipos**: `planned_entry`, `accrual`, `reversal`

**Resposta**:
```json
{
  "success": true,
  "ledgerEntryId": "led_xxx"
}
```

---

#### `POST /admin/finance/ledger/cancel`

Cancela uma entrada planejada.

**Body**:
```json
{
  "ledgerEntryId": "led_xxx",
  "reason": "Cancelado pelo admin"
}
```

**Resposta**:
```json
{
  "success": true
}
```

---

#### `POST /admin/finance/recurring-payable/set-active`

Ativa ou desativa um payable recorrente.

**Body**:
```json
{
  "payableId": "pay_xxx",
  "isActive": false
}
```

**Resposta**:
```json
{
  "success": true,
  "isActive": false
}
```

---

## Ferramentas de Agent (Tools)

Agents possuem acesso a tools baseadas em suas permissões. Consulte [permissions.md](../guias/permissions.md) para detalhes.

### Tools de Budget

| Tool | Descrição | Role Requerido |
|------|-----------|----------------|
| `adjust_agent_contract_budget` | Ajusta budget de contrato | `finance` |
| `top_up_agent_contract` | Adiciona fundos a contrato | `finance` |

### Tools de Agente

| Tool | Descrição | Role Requerido |
|------|-----------|----------------|
| `hire_agent` | Contrata novo agent | `hire_agent` workflow |
| `terminate_agent` | Termina agent | `terminate_agent` workflow |
| `update_agent_config` | Atualiza configurações | - |

### Tools de Agendamento

| Tool | Descrição | Role Requerido |
|------|-----------|----------------|
| `create_task_for_agent` | Cria tarefa para outro agent | `COORDINATOR` |
| `list_agent_tasks` | Lista tarefas de agent | - |
| `cancel_agent_task` | Cancela tarefa | `COORDINATOR` |
| `update_agent_task` | Atualiza tarefa | `COORDINATOR` |

---

## Códigos de Erro

| Código | Descrição |
|--------|-----------|
| `400` | Request inválido (validation error) |
| `401` | Não autenticado |
| `403` | Sem permissão (role/capability) |
| `404` | Recurso não encontrado |
| `409` | Conflito (ex: agent já em execução) |
| `500` | Erro interno do servidor |

---

## Rate Limiting

Não há rate limiting documentado atualmente, mas espera-se uso responsável da API.

---

## Próximos Passos

- [ ] Adicionar exemplos de request/response completos
- [ ] Documentar WebSocket events para real-time updates
- [ ] Adicionar OpenAPI/Swagger spec
- [ ] Documentar erros específicos de cada endpoint
