# Admin API

## Overview

REST API exposed by Forge for system management. Implemented in `apps/forge/src/admin/routes.ts`.

## Routes

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/agent | List agents |
| GET | /admin/agent/:agentId | Agent details |
| POST | /admin/agent | Create agent |
| PUT | /admin/agent/:agentId | Update agent |
| DELETE | /admin/agent/:agentId | Remove agent |
| POST | /admin/agent/:agentId/wake | Trigger agent wake |
| POST | /admin/agent/:agentId/reload | Reload runtime |

### Providers

| Method | Path | Description |
|--------|------|-------------|
| POST | /admin/agent-provider/upsert | Create/update provider |
| DELETE | /admin/agent-provider | Remove provider |

### MCP Servers

| Method | Path | Description |
|--------|------|-------------|
| POST | /admin/mcp-server | Create MCP server |
| PUT | /admin/mcp-server/:serverId | Update MCP server |
| DELETE | /admin/mcp-server | Remove MCP server |
| PUT | /admin/mcp-server/:serverId/active | Activate/deactivate |

### Schedules

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/schedules | List schedules |
| POST | /admin/schedule | Create schedule |
| PUT | /admin/schedule/:scheduleId | Update schedule |
| DELETE | /admin/schedule | Remove schedule |
| POST | /admin/schedule/:scheduleId/toggle | Toggle active |

### Roles

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/roles | List roles |
| POST | /admin/role | Create role |
| PUT | /admin/role/:roleId | Update role |
| DELETE | /admin/role/:roleId | Remove role |
| POST | /admin/role/:roleId/tool-permission | Add tool permission |
| DELETE | /admin/role/:roleId/tool-permission | Remove tool permission |

### Skills

| Method | Path | Description |
|--------|------|-------------|
| POST | /admin/agent/:agentId/skill | Upload skill |

### Finance

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/finance/overview | Financial overview |
| POST | /admin/finance/ledger-entry | Create ledger entry |
| POST | /admin/finance/recurring-payable | Create recurring payable |
| PUT | /admin/finance/recurring-payable/:id | Update payable |
| POST | /admin/finance/recurring-payable/:id/toggle | Toggle payable |

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/system/health | Health check |
| GET | /admin/system/settings | List settings |
| PUT | /admin/system/settings | Update setting |

## Read Models

### Dashboard Overview

```bash
GET /admin/overview
{
  totalAgents: number;
  activeAgents: number;
  totalContracts: number;
  totalBudget: number;
}
```

### Agent Details

```bash
GET /admin/agent/:agentId
{
  agent: Agent;
  role: AgentRole;
  contract: AgentExecutionContract;
  providers: AgentProvider[];
  schedule: Schedule | null;
  runtimeStatus: 'idle' | 'running' | 'absent';
}
```

### Finance Overview

```bash
GET /admin/finance/overview
{
  balance: number;
  totalPayables: number;
  recentMovements: LedgerEntry[];
  recurringPayables: RecurringPayable[];
}
```

## Validation

All requests validated with Zod schemas.

```typescript
const upsertAgentSchema = z.object({
  agentId: z.string().min(1).optional(),
  name: z.string().min(1),
  roleId: z.string().min(1),
  workspacePath: z.string().min(1),
});
```

## Response Format

```typescript
interface JsonResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}
```

Success: `{ status: 200, body: { data } }`
Error: `{ status: 400|404|500, body: { error: string } }`
