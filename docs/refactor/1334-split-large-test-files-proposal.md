# Refactor Proposal: Split Test Files Exceeding 300 Lines (#1334)

## Summary

Inventory of all `*.test.ts` files in `apps/forge/src` that exceed 300 lines. 37 files qualify. Priority split proposals produced for the largest files.

---

## Complete Inventory (> 300 lines)

| File | Lines | Tests | Tests/100L | Priority |
|------|------:|------:|-----------:|----------|
| `communication/internal-chat-service.test.ts` | 1174 | 49 | 4.2 | **P0** |
| `agents/agent-long-term-memory-recall.test.ts` | 1084 | 12 | 1.1 | **P0** |
| `communication/internal-chat-groups.test.ts` | 917 | 33 | 3.6 | **P0** |
| `minimax/manager.test.ts` | 864 | 49 | 5.7 | P1 |
| `agents/agent-runner.test.ts` | 835 | 59 | 7.1 | P1 |
| `admin/routes/schemas.test.ts` | 830 | 77 | 9.3 | P1 |
| `admin/routes/system/write.test.ts` | 718 | 38 | 5.3 | P2 |
| `github/__tests__/helpers.test.ts` | 698 | 78 | 11.2 | P2 |
| `admin/routes/agents/write-ops.test.ts` | 694 | 45 | 6.5 | P2 |
| `http/server.test.ts` | 691 | 41 | 5.9 | P2 |
| `admin/routes/helpers.test.ts` | 669 | 76 | 11.4 | P2 |
| `schedules/store.test.ts` | 653 | 43 | 6.6 | P2 |
| `capabilities/store.test.ts` | 641 | 61 | 9.5 | P2 |
| `llm/settings-store.test.ts` | 603 | 30 | 5.0 | P3 |
| `admin/read-model/helpers.test.ts` | 597 | 88 | 14.7 | P3 |
| `agents/migrate-legacy-checkpointed-om.test.ts` | 587 | 13 | 2.2 | **P0** |
| `agents/agent-long-term-memory.test.ts` | 586 | 13 | 2.2 | P3 |
| `hiring-rh.test.ts` | 565 | 38 | 6.7 | P3 |
| `agents/hiring-requests-handler.test.ts` | 565 | 38 | 6.7 | P3 |
| `admin/read-model/agents.test.ts` | 565 | 22 | 3.9 | P3 |
| `agents/agent-runner-helpers.test.ts` | 549 | 74 | 13.5 | P3 |
| `github/helpers.test.ts` | 515 | 53 | 10.3 | P3 |
| `finance/company-payables.test.ts` | 502 | 24 | 4.8 | P3 |
| `database/schema.test.ts` | 488 | 76 | 15.6 | P3 |
| `schedules/manager.test.ts` | 483 | 21 | 4.3 | P3 |
| `capabilities/runtime.test.ts` | 480 | 15 | 3.1 | P3 |
| `system-integrations/store.test.ts` | 478 | 29 | 6.1 | P3 |
| `agents/agent-runner-scheduler.test.ts` | 469 | 45 | 9.6 | P3 |
| `agents/global-skills.test.ts` | 462 | 58 | 12.6 | P3 |
| `admin/routes/agents/agent-routes.test.ts` | 461 | 21 | 4.6 | P3 |
| `communication/internal-chat-helpers.test.ts` | 448 | 47 | 10.5 | P3 |
| `admin/routes/finance/write.test.ts` | 439 | 24 | 5.5 | P3 |
| `agents/agent-loader.test.ts` | 433 | 20 | 4.6 | P3 |
| `finance/company-cash-ledger.test.ts` | 418 | 19 | 4.5 | P3 |
| `github/manager.api.test.ts` | 415 | 37 | 8.9 | P3 |
| `agents/agent-runner-messages.test.ts` | 396 | 28 | 7.1 | P3 |
| `agents/agent-runtime-types.test.ts` | 389 | 26 | 6.7 | P3 |

---

## Priority P0 — Immediate Candidates

### 1. `communication/internal-chat-service.test.ts` (1174 lines, 49 tests)

**Structure:** 1 top-level `describe`, 18 nested `describe` blocks. Tests cover:
- `registerAgentAccount`, `getAccountBySlug`, `getAccountByAgentId`, `listAccounts`
- `createChatGroup`, `listChatGroups`, `listConversations` (×3 variants), `listConversationsByAccount`
- `sendMessage`, `getMessages`, `getMessagesByAccount`
- `registerExternalAccount`, `updateExternalAccount`, `deleteExternalAccount`

**Proposed split:**
```
internal-chat-service.test.ts                    → stays (~500L, core account+message tests)
internal-chat-service-groups.test.ts           → extracted (~350L, createChatGroup, listGroups, listConversations variants)
internal-chat-service-external.test.ts          → extracted (~350L, external account + update + delete)
```

---

### 2. `agents/agent-long-term-memory-recall.test.ts` (1084 lines, 12 tests)

**Structure:** 5 top-level `describe` blocks, very long tests (200–300L each):
- `AgentLongTermMemoryRecall.initialize` (line 638) — ~114L test
- `AgentLongTermMemoryRecall.refreshIndex` (line 752) — ~133L test
- `AgentLongTermMemoryRecall.debugSearch` (line 885) — ~150L test
- `AgentLongTermMemoryRecall.dispose` (line 1035) — ~49L test

**Proposed split:**
```
agent-long-term-memory-recall.test.ts                  → stays (~300L, class-level setup + initialize)
agent-long-term-memory-recall-refresh.test.ts          → extracted (~200L, refreshIndex test)
agent-long-term-memory-recall-search.test.ts           → extracted (~200L, debugSearch test)
agent-long-term-memory-recall-dispose.test.ts          → extracted (~50L, dispose test)
```

Note: Very low test density (1.1 tests/100L) — these are integration-style tests with complex setup. Split would improve readability but each test file would still have only 1-3 tests.

---

### 3. `communication/internal-chat-groups.test.ts` (917 lines, 33 tests)

**Structure:** 13 nested `describe` blocks:
- `createChatGroup`, `addMemberToGroup`, `removeMemberFromGroup`
- `changeChatGroup` (×2 variants: update existing / create new)
- `listChatGroups`, `listGroupMembers`, `listGroupMembersByAccount`
- `listGroupMembersOrDmPeersByAccount`, `requireConversationMembership`, `requireConversationMembershipByAccount`
- `getRequiredConversationForAgent`, `getRequiredGroupForAgent`

**Proposed split:**
```
internal-chat-groups.test.ts                          → stays (~300L, createChatGroup + helpers)
internal-chat-groups-members.test.ts                  → extracted (~300L, add/remove member)
internal-chat-groups-listing.test.ts                  → extracted (~200L, listGroups, listMembers, listByAccount)
internal-chat-groups-authorization.test.ts            → extracted (~150L, requireMembership, getRequired*)
```

---

### 4. `agents/migrate-legacy-checkpointed-om.test.ts` (587 lines, 13 tests)

**Structure:** Likely has multiple long migration test functions. Very low density (2.2 tests/100L).

**Proposed split:** Needs deeper analysis of test function structure. Await inspection before proposing.

---

## Priority P1 — Good Test Density, Worth Splitting

### 5. `agents/agent-runner.test.ts` (835 lines, 59 tests)

**Structure:** High test density (7.1 tests/100L). Likely already organized into describe blocks by feature. Splitting would improve navigation but file is already reasonably well-structured.

**Proposed:** Consider by-section split if describe blocks clearly delineate responsibility zones.

---

### 6. `minimax/manager.test.ts` (864 lines, 49 tests)

**Structure:** 9 describe blocks:
- `MiniMaxClient.textToSpeech`, `MiniMaxClient.listVoices`, `MiniMaxClient.generateImage`
- `MiniMaxClient.createVideoGenerationTask`, `MiniMaxClient.queryVideoGeneration`, `MiniMaxClient.retrieveFile`
- `MiniMaxClient.requestJson error handling`, `createMiniMaxManager`, `createMiniMaxClient`

**Proposed split:**
```
minimax/manager.test.ts                              → stays (~250L, MiniMaxClient factory + createMiniMaxManager)
minimax/manager-tts.test.ts                         → extracted (~200L, textToSpeech + listVoices)
minimax/manager-image.test.ts                       → extracted (~200L, generateImage)
minimax/manager-video.test.ts                      → extracted (~200L, video generation + retrieval)
```

---

### 7. `admin/routes/schemas.test.ts` (830 lines, 77 tests)

**Structure:** High test density (9.3/100L). 77 tests suggests already well-organized. Investigate describe structure before splitting.

---

## Priority P2 — Moderate Files

Files in the 600–800 line range. Many already have good describe block structure:
- `admin/routes/system/write.test.ts` (718L, 38 tests)
- `github/__tests__/helpers.test.ts` (698L, 78 tests) — note: `__tests__` subdirectory
- `admin/routes/agents/write-ops.test.ts` (694L, 45 tests)
- `http/server.test.ts` (691L, 41 tests)
- `admin/routes/helpers.test.ts` (669L, 76 tests)
- `schedules/store.test.ts` (653L, 43 tests)
- `capabilities/store.test.ts` (641L, 61 tests)

All are candidates for future splitting but lower urgency.

---

## Priority P3 — Lower Priority

Files 400–600 lines. Many are at acceptable size. Lower priority for immediate action unless maintainability becomes a concern.

---

## Key Principles for Test File Splits

1. **One describe block per file** — Split along describe block boundaries, not arbitrarily by line count
2. **Keep shared setup in a `_helpers.test.ts`** — Extract mock factories, `makeRow()` helpers, `createMockDb()` into shared helper files
3. **Preserve test count in each file** — Don't merge tests across files; each new file should have a meaningful number of tests
4. **Run full suite after each split** — Ensure no test pollution between split files (mock cleanup, vi.clearAllMocks in beforeEach)
5. **Update imports** — If helper files move, all referencing test files need updated import paths

---

## Implementation Order

1. **`internal-chat-groups.test.ts`** (917L) — clear describe block boundaries, most straightforward split
2. **`minimax/manager.test.ts`** (864L) — describe blocks map 1:1 to operation domains
3. **`internal-chat-service.test.ts`** (1174L) — 3 clear sections by account type (internal vs external)
4. **`agent-long-term-memory-recall.test.ts`** (1084L) — per-method splits needed but very low test density
5. All P2/P3 files — future sprint work

---

## Branch

`refactor/1334-split-large-test-files` — documentation only. Implementation to follow per above priority order.