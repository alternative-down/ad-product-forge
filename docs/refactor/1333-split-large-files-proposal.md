# Refactor Proposal: Split Files Exceeding 300 Lines (#1333)

## Summary

This file documents all source files in `apps/forge/src` that exceed 300 lines and proposes specific split strategies for each, prioritized by size and test coverage.

---

## Files ≥ 300 Lines — Full Inventory

| File | Lines | Tests | Test Coverage | Priority |
|------|------:|------:|--------------|----------|
| `github/manager.ts` | 1543 | 12 | 0.8% (very low) | **P0** |
| `communication/internal-chat-service.ts` | 1387 | 48 | 3.5% (low) | P1 |
| `agents/agent-runner.ts` | 1380 | 59 | 4.3% (low) | P1 |
| `agents/ltm/recall.ts` | 1220 | 20 | 1.6% (very low) | P2 |
| `database/schema.ts` | 887 | — | N/A (schema) | N/A |
| `admin/routes.ts` | 815 | 0 | 0% (untested) | **P0** |
| `admin/read-model/agents.ts` | 772 | 22 | 2.8% (low) | P1 |
| `coolify/manager.ts` | 742 | 41 | 5.5% (low) | P2 |
| `agents/agent-long-term-memory.ts` | 734 | 13 | 1.8% (very low) | P2 |
| `email-account.ts` | 723 | 37 | 5.1% (low) | **P0** |
| `discord-account.ts` | 681 | 11 | 1.6% (very low) | **P0** |
| `agents/agent-runner-scheduler.ts` | 675 | 45 | 6.7% (low) | P2 |
| `agents/hiring-requests-handler.ts` | 588 | 0 | 0% (untested) | **P0** |
| `communication/internal-chat-groups.ts` | 587 | 0 | 0% (untested) | **P0** |
| `minimax/manager.ts` | 578 | 49 | 8.5% (low) | P2 |
| `agents/agent-home-metrics.ts` | 576 | 34 | 5.9% (low) | P2 |
| `schedules/tools.ts` | 538 | 36 | 6.7% (low) | P2 |
| `schedules/manager.ts` | 536 | 21 | 3.9% (low) | P2 |

---

## Already-Split Patterns (reference)

The codebase already uses the Ops pattern successfully for `github/manager.ts`:

```
github/manager.ts           (1543L) — main orchestrator
github/ops/repos.ts         (112L)  — extracted
github/ops/issues.ts        (240L)  — extracted
github/ops/pull-requests.ts (178L)  — extracted
github/ops/labels.ts        (139L)  — extracted
github/ops/milestones.ts    (103L)  — extracted
github/ops/routing.ts       (150L)  — extracted
github/ops/credentials.ts   (66L)   — extracted
github/ops/context.ts       (64L)   — shared context
```

This same pattern should be applied to other large files.

---

## Priority P0 — High Impact, No Test Coverage

### 1. `admin/routes.ts` (815 lines, 0 tests)

**Strategy: Extract provider-specific sections**

Internal structure:
- `registerAdminRoutes()` factory function (~800 lines)
- Contains: agent CRUD, system settings, integrations, webhooks, health, system info routes

**Proposed split:**
```
admin/routes.ts          → admin/routes-core.ts  (~300L, registration only)
admin/agent-routes.ts    → extracted (~250L, agent CRUD)
admin/system-routes.ts   → extracted (~200L, settings, health)
admin/webhook-routes.ts → extracted (~150L, webhook handling)
```

**Note:** `admin/read-model/agents.ts` (772L, 22 tests) is a separate concern — read model for agents list — and should NOT be merged with routes.

---

### 2. `discord-account.ts` (681 lines, 11 tests)

**Strategy: Extract utilities + ops**

Internal structure — 20+ inner functions:
- `createDiscordProvider()` factory
- Utility functions (lines ~42–155): `pruneRecentOutboundMessages`, `rememberOutboundMessage`, `isRecentOutboundEcho`, `splitDiscordMessageContent`, `parseFilterDate`, `downloadDiscordAttachments`, `toDiscordOutboundFiles`
- Client management (~185–335): `withTyping`, `toInboundMessage`, `deliverMessage`, `flushPendingMessages`, `getReadyClient`, `listCandidateChannels`, `loadCandidateUsers`, `listCandidateUsers`, `resolveDiscordTargetChannel`, `listChannelMessages`
- Message handling (~588+): `extractDiscordMessageContent`
- Return block

**Proposed split:**
```
discord-account.ts             → discord-account-core.ts  (~350L, main factory + return block)
discord-account-utils.ts       → extracted (~200L, all utility functions)
discord-account-message.ts    → extracted (~150L, message delivery + channel management)
```

---

### 3. `email-account.ts` (723 lines, 37 tests)

**Strategy: Extract utilities + imap client management**

Internal structure:
- `createEmailProvider()` factory
- Utility functions (~39–259): `toUint8Array`, `toCommunicationAttachments`, `pruneRecentOutboundMessages`, address helpers, thread key resolution, body extraction
- IMAP client (~259–414): `connectImap`, `withInboxQueryClient`
- Message processing (~344–414): `deliverMessage`, `flushPendingMessages`, `processMessage`, `markMessageSeen`
- Return block

**Proposed split:**
```
email-account.ts               → email-account-core.ts   (~350L, factory + return block)
email-account-utils.ts        → extracted (~200L, utilities)
email-account-imap.ts         → extracted (~200L, IMAP client + message processing)
```

---

### 4. `agents/hiring-requests-handler.ts` (588 lines, 0 tests)

**Strategy: Extract by responsibility zone**

Internal structure — 3 return blocks:
- Return at line ~86: "Request Handling" zone (parsing, validation, initial responses)
- Return at line ~215: "State Management" zone (in-memory job queue, job tracking)
- Return at line ~513: Main export

**Proposed split:**
```
hiring-requests-handler.ts        → hiring-requests-handler-core.ts  (~150L, main factory + orchestration)
hiring-requests-handler-parsing.ts → extracted (~200L, request parsing + validation)
hiring-requests-handler-state.ts   → extracted (~250L, job queue + state management)
```

---

### 5. `communication/internal-chat-groups.ts` (587 lines, 0 tests)

**Strategy: Extract by operation cluster**

Internal structure: single `createInternalChatGroups()` factory (~587 lines), no sections/comments.

Functions (roughly in order):
- Groups CRUD (create, list, update, delete groups)
- Members management (add, remove, list members)
- DM logic (resolveOrCreateDM)

**Proposed split:**
```
internal-chat-groups.ts           → internal-chat-groups-core.ts (~250L, factory + DM logic)
internal-chat-groups-crud.ts      → extracted (~200L, group CRUD operations)
internal-chat-groups-members.ts   → extracted (~150L, member management)
```

---

## Priority P1 — Large Files With Test Coverage

### 6. `communication/internal-chat-service.ts` (1387 lines, 48 tests)

Already organized into 5 documented responsibility zones (lines 11–40). A structural refactor would cleanly separate these zones into extracted files. However, the current ops/ pattern used in github/manager.ts has already proven the right approach — internal-chat-service delegates to internal-chat-accounts.ts and internal-chat-groups.ts. The remaining internal functions (attachments, conversations/messages) could be further split.

**Proposed split:**
```
internal-chat-service.ts               → stays as thin factory (~400L)
communication/internal-chat-attachment.ts → extracted (~200L, attachments zone)
communication/internal-chat-conversations.ts → extracted (~400L, conversations + messages)
```

### 7. `admin/read-model/agents.ts` (772 lines, 22 tests)

**Strategy: Extract agent metrics computation**

Internal structure — likely has agent summary computation and formatting logic mixed together.

**Proposed split:** Needs deeper analysis. Await test coverage before proposing.

---

## Priority P2 — Large But Lower Priority

### 8. `github/manager.ts` (1543 lines, 12 tests)

Already has Ops pattern. The main factory function at ~73 lines is reasonable. The ops sub-modules are all < 250L. Priority P2 — low test coverage but structure already sound.

### 9. `agents/agent-runner.ts` (1380 lines, 59 tests)

Single large factory function. Sub-sections could be extracted but needs careful analysis to avoid breaking the internal closure dependencies.

### 10. `agents/ltm/recall.ts` (1220 lines, 20 tests)

Contains `AgentLongTermMemoryRecall` class (144L+) and `createAgentLongTermMemoryRecall` factory. The class could be extracted. Priority P2.

### 11. `coolify/manager.ts` (742 lines, 41 tests)

Has a `createCoolifyManager` with multiple return blocks (~416, ~672, ~683, ~695). Each could be its own file: core, deployments, environments, logs.

### 12–17. Remaining managers (agent-long-term-memory, minimax, agent-home-metrics, schedules/tools, schedules/manager, agent-runner-scheduler)

All have existing test files and organized return blocks. Lower priority but candidates for future splitting.

---

## Implementation Guidance

**For each split:**
1. Identify the "anchor" function — the main exported factory
2. Identify pure utility functions that have no closure dependency on the main factory's state
3. Identify sub-modules (collections of related functions)
4. Extract in order: utilities first, then sub-modules, keep factory last
5. Update imports — verify TypeScript compiles and tests pass after each extraction
6. Maintain API contracts — the return block of the main factory should expose the same public interface

**Key principle:** The Ops pattern from github/manager.ts is the model to follow. Sub-modules should be factories that receive a shared `context` or `deps` object, never relying on closure state from the parent.

---

## Branch

`refactor/1333-split-large-files` — documentation only (this file). Future PRs will implement individual splits.