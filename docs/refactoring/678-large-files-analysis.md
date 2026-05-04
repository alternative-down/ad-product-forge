# Refactoring Analysis: Large Files in ad-product-forge

## Scope

This PR is the **analysis phase** for issue #678. It documents the current state of large files, proposes a split strategy, and identifies priority candidates. No production code changes are made here — this provides the decision foundation for follow-up refactor PRs.

## Files >= 700 lines (excluding generated + tests)

Updated after #1300 dedup (-1277 LOC removed):

| File | Lines | Domain | Split Difficulty |
|------|-------|--------|-------------------|
| `github/manager.ts` | 1543 | GitHub App provisioning + API operations | Medium — many shared closures |
| `communication/internal-chat-service.ts` | 1387 | Internal chat messaging | Low — clear domain boundaries |
| `agents/agent-runner.ts` | 1314 | Agent execution + scheduling | High — tight state coupling |
| `agents/ltm/recall.ts` | 1220 | LTM recall search (canonical — dedup done in #1300) | Medium — search/retrieval layers |
| `database/schema.ts` | 887 | DB schema definitions | N/A — single schema file |
| `admin/routes.ts` | 815 | Admin HTTP routes | Low — pure routing/handler wiring |
| `forge-runtime-core/src/sqlite-workspace-retrieval.ts` | 800 | Workspace retrieval + embedding | Medium — retrieval pipeline |
| `admin/read-model/agents.ts` | 772 | Admin read model | Medium — query grouping possible |
| `coolify/manager.ts` | 742 | Coolify API operations | Medium — operation grouping |

Note: `agents/agent-long-term-memory-recall.ts` was **removed in #1300** as a duplicate of `ltm/recall.ts` (-1277 LOC).

## Priority: High-Impact Splits

### 1. `github/manager.ts` (1543 lines → 6 files)

**Problem**: Single 1543-line IIFE with 45 operations. Mixing provisioning flow, API operations (repos, issues, PRs, labels, milestones), HTTP handlers (register, setup, webhook), and credential management.

**Proposed split** (by domain):

```
src/github/
  manager.ts                 # Factory + credential helpers + types
  operations/repositories.ts # list/create/update/delete repo operations
  operations/issues.ts       # list/get/create/update/close/reopen issue + comments + labels
  operations/pull-requests.ts # list/create/get/update/merge PR + comments
  operations/provisioning.ts # handleManifestCallback, handleSetupCallback, handleWebhook
  operations/milestones.ts   # list/create/update/delete milestone
  operations/labels.ts       # list/create/update/delete label
```

**Constraint**: Each sub-module exports functions that receive `agentId` and call `getActiveCredentials(agentId)` internally. No credential-passing across files.

**Estimated reduction**: 1543 → ~200 (factory + types + credential helpers)

### 2. `internal-chat-service.ts` (1387 lines → 3 files)

**Problem**: ~50 operations mixed: account management, group management, conversation/message management, cross-account routing, and helpers.

**Proposed split** (by responsibility):

```
src/communication/
  internal-chat-service.ts   # Factory + type (keeps createInternalChatService shell)
  operations/accounts.ts    # registerAgentAccount, registerExternalAccount, updateExternalAccount,
                             # deleteExternalAccount, listAccounts, getAccountBySlug/AgentId/TargetKey
  operations/groups.ts       # createChatGroup, addMemberToGroup, removeMemberFromGroup,
                             # changeChatGroup, listChatGroups, listGroupMembers*, archiveConversation*
  operations/messages.ts     # getMessages*, sendMessage, getUnreadSummary,
                             # listRecentConversations, getMessageAttachment*
```

**Estimated reduction**: 1387 → ~250 (factory + type + cross-account wrappers)

### 3. `admin/routes.ts` (815 lines → 3 files)

**Problem**: Route registration and handler bodies are mixed. Handler logic is intertwined with validation and response building.

**Proposed split** (by route group):

```
src/admin/routes/
  routes.ts          # Factory + route registration
  routes/read-model.ts   # Read-model queries → already partially split in read-model/agents.ts
  routes/write-ops.ts   # Write operations → already 602 lines in write-ops.ts
  routes/schemas.ts      # Already exists at 539 lines
```

**Status**: `read-model/agents.ts` (772 lines) already exists as a separate file. `write-ops.ts` (602 lines) is separate. The remaining `routes.ts` glue code (~200 lines) is manageable.

### 4. `agents/ltm/recall.ts` — dedup resolved

PR #1300 removed the duplicate `agent-long-term-memory-recall.ts` (-1277 LOC). The remaining `ltm/recall.ts` (1220 lines) is the canonical implementation. No further deduplication action needed.

## Files: Do Not Split (High Risk / Low Value)

| File | Reason |
|------|--------|
| `database/schema.ts` | Single coherent schema, splitting adds no value |
| `forge-runtime-core/src/sqlite-workspace-retrieval.ts` | Cohesive retrieval pipeline — split would break abstraction |
| `agents/agent-runner.ts` | Tight state coupling across runtime lifecycle — premature split would entangle dependencies |

## Files: Monitor

- `admin/read-model/agents.ts` (772 lines) — read-model is already split across files, this is the aggregate query file
- `coolify/manager.ts` (742 lines) — already well-structured by operation type

## Follow-up Plan

1. **github/manager.ts** — highest value split, large and complex. Recommend tackling first.
2. **internal-chat-service.ts** — clear domain boundaries, moderate effort.
3. **admin/routes.ts** — mostly already done in practice; assess remaining glue code.

## Verification

All follow-up PRs should:
- Keep tests green
- Preserve existing function signatures (no breaking changes to callers)
- Not increase total line count across the split files beyond the original