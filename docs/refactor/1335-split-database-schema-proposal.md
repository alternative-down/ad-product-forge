# Refactor Proposal: Split database/schema.ts (#1335)

## Summary

`apps/forge/src/database/schema.ts` has 887 lines and contains 34 tables + 24 relations. This file is imported by 61 non-test source files across the codebase, making any refactor a high-stakes, cross-cutting change. A full modular split should be planned carefully.

---

## Table Inventory

| #   | Table                             |   Lines | Group             | Imported by (non-test) |
| --- | --------------------------------- | ------: | ----------------- | ---------------------- |
| 1   | `agents`                          |     ~27 | Agent Core        | 48 files               |
| 2   | `agentRoles`                      |     ~10 | Roles/Permissions | 5 files                |
| 3   | `roleToolPermissions`             |     ~11 | Roles/Permissions | 5 files                |
| 4   | `roleWorkflowPermissions`         |     ~11 | Roles/Permissions | 5 files                |
| 5   | `systemSettings`                  |     ~35 | System/Config     | 15+ files              |
| 6   | `agentExecutionContracts`         |     ~16 | Agent Contracts   | 4 files                |
| 7   | `agentExecutionSteps`             |     ~29 | Agent Contracts   | 2 files                |
| 8   | `agentHomeMetricSnapshots`        |     ~17 | Agent Metrics     | 2 files                |
| 9   | `agentCheckpointedOmStates`       |     ~13 | Agent LTM         | 2 files                |
| 10  | `agentLongTermMemoryStates`       |     ~10 | Agent LTM         | 2 files                |
| 11  | `agentLongTermMemoryRecallStates` |     ~12 | Agent LTM         | 2 files                |
| 12  | `agentNotifications`              |     ~17 | Notifications     | 2 files                |
| 13  | `agentSchedules`                  |     ~32 | Schedules         | 2 files                |
| 14  | `internalChatAccounts`            |     ~17 | Internal Chat     | 6 files                |
| 15  | `internalChatConversations`       |     ~16 | Internal Chat     | 6 files                |
| 16  | `internalChatConversationMembers` |     ~17 | Internal Chat     | 6 files                |
| 17  | `internalChatMessages`            |     ~19 | Internal Chat     | 6 files                |
| 18  | `internalChatMessageReads`        |     ~17 | Internal Chat     | 6 files                |
| 19  | `internalChatMessageAttachments`  |     ~19 | Internal Chat     | 6 files                |
| 20  | `llmModelPrices`                  |     ~12 | LLM Config        | 3 files                |
| 21  | `companyCashLedger`               |     ~19 | Finance           | 4 files                |
| 22  | `companyRecurringPayables`        |     ~51 | Finance           | 3 files                |
| 23  | `systemIntegrations`              |     ~12 | System/Config     | 3 files                |
| 24  | `llmProfiles`                     |     ~19 | LLM Config        | 3 files                |
| 25  | `systemLlmDefaults`               |     ~16 | LLM Config        | 3 files                |
| 26  | `agentProviders`                  | ~188(!) | Agent Core        | 5 files                |
| 27  | `mcpServerConfigs`                |     ~29 | MCP               | 4 files                |
| 28  | `agentMcpConfigs`                 |     ~41 | MCP               | 4 files                |
| 29  | `webhookRoutes`                   |     ~10 | Webhooks          | 2 files                |
| 30  | `webhookEvents`                   |     ~12 | Webhooks          | 2 files                |
| 31  | `knowledgeDocuments`              |     ~13 | Knowledge         | 2 files                |
| 32  | `tickets`                         |     ~21 | Ticketing         | 2 files                |
| 33  | `ticketMessages`                  |     ~16 | Ticketing         | 2 files                |

Plus 24 `Relations` exports (~280 lines) and 3 config schemas at top (~32 lines).

---

## Proposed Module Structure

```
database/
  schema.ts              (root re-export, ~15 lines — minimal)
  schema-agents.ts       (~230L: agents, providers, contracts, steps, metrics, LTM)
  schema-roles.ts        (~50L: agentRoles, roleToolPermissions, roleWorkflowPermissions)
  schema-chat.ts         (~100L: internalChat* tables + relations)
  schema-finance.ts      (~70L: companyCashLedger, companyRecurringPayables)
  schema-llm.ts          (~50L: llmProfiles, llmModelPrices, systemLlmDefaults)
  schema-config.ts       (~50L: systemSettings, systemIntegrations)
  schema-schedules.ts    (~32L: agentSchedules)
  schema-notifications.ts (~17L: agentNotifications)
  schema-mcp.ts          (~70L: mcpServerConfigs, agentMcpConfigs)
  schema-webhooks.ts     (~22L: webhookRoutes, webhookEvents)
  schema-knowledge.ts    (~13L: knowledgeDocuments)
  schema-tickets.ts      (~37L: tickets, ticketMessages)
```

---

## Key Insight: `agentProviders` is the Anomaly

`agentProviders` (lines 545–732) alone is **188 lines** — more than the entire Discord or Email account files. This single table definition has:

- 6 optional `.notNull()` fields (Drizzle requires explicit `.notNull()` when there's no `.default()`)
- A giant `.$type<ProviderCredentials>()` field with inline type
- A check constraint
- An index
- A relation

**This table deserves extraction regardless of other splits.** Moving just `agentProviders` out of schema.ts reduces the file from 887 to ~700 lines immediately.

---

## Implementation Strategy

### Phase 1: Extract `agentProviders` + relations (~200L removed)

**Risk: Low.** Only 5 non-test files import agentProviders. After extraction, update their imports. Test everything passes.

### Phase 2: Group tables by domain (~300L removed)

Extract domain groups in order of fewest cross-file dependencies first:

1. **Knowledge** (2 files import) — `knowledgeDocuments`
2. **Webhooks** (2 files) — `webhookRoutes`, `webhookEvents`
3. **Ticketing** (2 files) — `tickets`, `ticketMessages`
4. **Schedules** (2 files) — `agentSchedules`
5. **Notifications** (2 files) — `agentNotifications`

### Phase 3: Group by cross-cutting concerns (~300L removed)

6. **MCP** (4 files) — `mcpServerConfigs`, `agentMcpConfigs`
7. **Finance** (4 files) — `companyCashLedger`, `companyRecurringPayables`
8. **LLM Config** (3 files) — `llmProfiles`, `llmModelPrices`, `systemLlmDefaults`

### Phase 4: Agent Core (~230L remaining)

9. **Agent Core** — `agents`, `agentProviders` (extracted in phase 1), `agentExecutionContracts`, `agentExecutionSteps`, `agentHomeMetricSnapshots`, `agentCheckpointedOmStates`, `agentLongTermMemoryStates`, `agentLongTermMemoryRecallStates`
10. **Roles/Permissions** — `agentRoles`, `roleToolPermissions`, `roleWorkflowPermissions`
11. **Internal Chat** — all internalChat\* tables
12. **System Config** — `systemSettings`, `systemIntegrations`

---

## Re-export Pattern

Each module exports its tables and types:

```typescript
// database/schema-agents.ts
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const agents = sqliteTable('agents', { ... });
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export const agentsRelations = relations(agents, ...);
```

Main `schema.ts` becomes a thin re-export aggregator:

```typescript
// database/schema.ts
export * from './schema-agents';
export * from './schema-roles';
export * from './schema-chat';
// ...
```

This keeps all 61 importing files working without modification. Only `database/schema.ts` changes its structure — everything else imports from `../database/schema` as before.

---

## Key Risks

1. **Cross-file imports of individual tables** — If any file imports from the module path directly (e.g., `from './schema-agents'`), changing the re-export pattern breaks it. Need to audit all 61 import sites before implementing.
2. **Test files** — Test files mock `vi.mock('../database/schema')`. Any module split changes the mock path. Test files need careful review.
3. **Circular dependencies** — `agentsRelations` references `agentExecutionContracts`, `agentRoles`, `agentProviders`. All must live in the same module OR the relation must be defined after all referenced tables.
4. **Drizzle ORM `query` API** — `db.query.agents.findMany()` uses the table definition. If tables move to modules, the query API auto-discovers them based on what's registered in `schema.ts`. Moving tables to sub-modules breaks `db.query.*` unless the sub-module is also registered.

---

## Recommendation

**Do not implement this split until a thorough import audit is done.** The `db.query.*` discovery mechanism and all 61 import sites must be verified to work with re-exports before committing to this plan. This proposal should be followed by a Phase 0 audit task.

**Immediate win:** Extract `agentProviders` into `database/schema-agent-providers.ts` (188L reduction) — lowest risk, clearest benefit. Run tests after each extraction.

---

## Branch

`refactor/1335-schema-split` — documentation only. Implementation pending Phase 0 import audit.
