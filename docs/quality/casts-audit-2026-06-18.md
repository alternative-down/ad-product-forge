# Cast Audit Phase 1 — 2026-06-18 (Day 18)

> **Refs #5785** — Audit + categorize `as` casts in `apps/forge/src`. NO source modifications in this PR.
> Phase 1 = observation; Phase 2 = prioritized cleanup; Phase 3 = L#NN-50 tripwires.

## TL;DR

- **Total `as X` patterns in apps/forge/src (non-test)**: ~735 lines mentioning ` as ` (broad grep)
- **Strict cast sites** (real `as X` casts, excluding import aliases): ~232 (per #5785) to ~735 (broad grep). Significant drift since original audit (Day 17 14:00Z).
- **Pattern breakdown** (this audit, Day 18 12:17Z):
  - Pattern 1 — `as Parameters<typeof X>[N]`: **15 sites** (1 pattern, mostly `github/manager.ts` wrappers)
  - Pattern 2 — `as unknown as X`: **62 sites** ⚠️ (worst pattern — bypasses TS safety)
  - Pattern 3 — `(x as Y)` interface narrowing: **59 sites** (Drizzle row → domain type mismatch)
  - Pattern 4 — `[] as Array<...>` literal narrowing: **3 sites** (initialization)
- **Top cast-heavy files** (broad grep, includes imports):
  - `admin/routes.ts` (48) — note: not in issue #5785's original top 10
  - `communication/internal-chat-service.ts` (45) — not in original top 10
  - `admin/read-model/agents-list.ts` (21) — original #1, OUT of scope per Thoren
  - `github/manager.ts` (18) — original #2 (recommended entry per Thoren)
  - `agents/hiring-requests-handler.ts` (18) — not in original top 10
- **L#NN-32 v3 cross-check** (Thoren's numbers verified Day 18 12:14Z):
  - `github/manager.ts`: 8 `as Parameters<` (issue said 6), 3 `as unknown as` (issue said 4), 26 total ` as ` patterns (issue said 10). Numbers drifted slightly; patterns present and growing.

## Top 20 files by `as` pattern count

| # | File | Total `as` sites | Recommended action |
|---|------|------------------|---------------------|
| 1 | `admin/routes.ts` | 48 | Phase 2: high-priority — new top file, not in original audit |
| 2 | `communication/internal-chat-service.ts` | 45 | Phase 2: high-priority — also new top |
| 3 | `admin/read-model/agents-list.ts` | 21 | OUT of scope (Thoren's Lead 8a boundary) |
| 4 | `github/manager.ts` | 18 | Phase 2 P1 entry — 8 `as Parameters<` + 3 `as unknown as` |
| 5 | `agents/hiring-requests-handler.ts` | 18 | Phase 2 — cross-module interfaces |
| 6 | `admin/read-model/agents-runtime-memory.ts` | 16 | OUT of scope (read-model boundary) |
| 7 | `admin/read-model/helpers.ts` | 15 | OUT of scope |
| 8 | `schedules/tools/tools.ts` | 13 | Phase 2 — internal tool dispatch |
| 9 | `minimax/manager.ts` | 12 | Phase 2 — provider wrapper |
| 10 | `agents/agent-runner-generate.ts` | 12 | Phase 2 — runtime hot path |
| 11 | `webhooks/store.ts` | 11 | Phase 2 — Drizzle row casting |
| 12 | `communication/internal-chat-participants.ts` | 11 | Phase 2 — internal API boundary |
| 13 | `agents/runtime/prompt.ts` | 11 | Phase 2 — runtime composition |
| 14 | `admin/routes/internal-chat/internal-chat-account-routes.ts` | 11 | OUT of scope |
| 15 | `schedules/manager/mutations.ts` | 10 | Phase 2 P2 — recently touched by #5803/#5805 |
| 16 | `agents/create-forge-agent.ts` | 10 | Phase 2 — agent creation |
| 17 | `system-integrations/store.ts` | 9 | Phase 2 — Drizzle row casting |
| 18 | `github/ops/routing.ts` | 9 | Phase 2 — route handler |
| 19 | `communication/internal-chat-listing-types.ts` | 9 | Phase 2 — type definitions |
| 20 | `minimax/tools.ts` | 8 | Phase 2 — provider tools |

## Pattern 1 — `as Parameters<typeof X>[N]` (15 sites)

Cross-function narrowing pattern. Most common in `github/manager.ts` where the manager forwards payloads to helper functions:

```typescript
payload as Parameters<typeof createGitHubInstallWakeContent>[0],
payload as Parameters<typeof createGitHubWebhookWakeContent>[0],
payload as Parameters<typeof summarizeGitHubEvent>[0],
```

### File distribution

| File | Count | % of pattern |
|------|-------|--------------|
| `github/manager.ts` | 8 | 53% |
| `admin/read-model/agents-list.ts` | 2 | 13% (OUT of scope) |
| `schedules/manager/manager.ts` | 1 | 7% |
| `agents/workspace-skills.ts` | 1 | 7% |
| `agents/agent-long-term-memory.ts` | 1 | 7% |
| `admin/routes/system/write.ts` | 1 | 7% |
| `admin/routes/internal-chat/internal-chat-conversation-routes.ts` | 1 | 7% |

### Elimination strategy

Type aliases upfront:
```typescript
// Before
payload as Parameters<typeof createGitHubInstallWakeContent>[0]

// After
type InstallPayload = Parameters<typeof createGitHubInstallWakeContent>[0];
function foo(payload: InstallPayload) { ... }
```

**Phase 2 candidate**: `github/manager.ts` 8 sites → 1 type alias + 8 usage sites.

## Pattern 2 — `as unknown as X` (62 sites) ⚠️

Double-cast escape hatch. **Worst pattern** — explicitly bypasses TypeScript safety.

### Examples

```typescript
opsCtx.opsRouting = createRoutingOps(opsCtx as unknown as OpsContext);
} as unknown as AgentDetail;
```

### File distribution (top 10)

| File | Count | % of pattern |
|------|-------|--------------|
| `micro-erp/read-model.ts` | 6 | 10% |
| `admin/routes/agents/provider-mcp.ts` | 6 | 10% |
| `minimax/tools.ts` | 4 | 6% |
| `finance/payment-receivables.ts` | 4 | 6% |
| `communication/internal-chat-groups.ts` | 4 | 6% |
| `github/manager.ts` | 3 | 5% |
| `email-account.ts` | 3 | 5% |
| `agents/error-formatting.ts` | 3 | 5% |
| `webhooks/store.ts` | 2 | 3% |
| `github/ops/routing.ts` | 2 | 3% |

### Elimination strategy

The `as unknown as` pattern indicates a **type system gap** between two related types. Common causes:
- Drizzle row → domain type (no schema-derived type)
- HTTP payload → domain model (no shared interface)
- Cross-module interface drift (helper expects type from another module)

Solutions:
1. Type alias bridges: `type Bridge = Domain & ExtraFields`
2. Discriminated unions: `type Payload = VariantA | VariantB` + narrowing
3. Schema-derived types (Drizzle): `typeof schema.table.$inferSelect`
4. Validation schemas (Zod): `z.infer<typeof mySchema>`

**Phase 2 candidate**: `micro-erp/read-model.ts` 6 sites + `admin/routes/agents/provider-mcp.ts` 6 sites — biggest single-file gains.
**Phase 3 tripwire candidate**: `__no-as-unknown-as.test.ts` — fail if any file uses `as unknown as` (with allowlist for tests + cross-bridge cases).

## Pattern 3 — `(x as Y)` interface narrowing (59 sites)

Drizzle row → domain type narrowing. Most common in read-model code:

```typescript
role: (agent as Agent).roleId ?? null,
const roleId = (agent as Agent).roleId;
const id = (agent as Agent).modelProfileId;
```

### Examples by file

```typescript
// system-integrations/store.ts:95
parseIntegrationConfigForList(row.providerType as SystemIntegrationProviderType, encryptedConfig)

// admin/read-model/helpers.ts:438
typeof (toolResult as Record<string, unknown>).toolCallId === 'string'
```

### Elimination strategy

The pattern signals that `x` is typed as a base type (e.g., `Record<string, unknown>` or a partial domain type) and is being narrowed at use sites. Solutions:

1. **Type the query result properly via Drizzle's `select()` schema**:
   ```typescript
   const rows: Agent[] = await db.select().from(agents).where(...);
   ```
2. **Domain layer accepts Drizzle types directly** — eliminates the row/domain divide
3. **Generic helper with type parameter**:
   ```typescript
   function narrow<T>(value: unknown): T { ... }
   ```

**Phase 2 candidate**: Files with 5+ Pattern 3 sites first (admin/read-model/helpers.ts 15, but OUT of scope; system-integrations/store.ts 9).

## Pattern 4 — `[] as Array<...>` literal narrowing (3 sites)

Minor pattern, common in initialization:

```typescript
const messages: Array<{ role: string; content: unknown }> = [] as Array<{ role: string; content: unknown }>;
```

### Elimination strategy

Trivial — replace with `Array<T>` annotation:

```typescript
const messages: Array<{ role: string; content: unknown }> = [];
```

**Phase 2 candidate**: All 3 sites fixable in single PR.

## Cross-cutting observations

### A. Cast growth rate

Issue #5785 audited 232 casts on Day 17 14:00Z. Today Day 18 12:17Z (≈22h later), broad grep finds 735 ` as ` patterns. Even excluding import aliases (rough 50% of broad grep), the count is ~370 cast sites. **~60% growth in 22h** suggests casts are being added faster than removed.

### B. Top 10 from issue vs today

| Original (Day 17) | Today (Day 18) |
|-------------------|----------------|
| `agents-list.ts` 13 | OUT of scope, still high |
| `github/manager.ts` 10 | 18 (+8) |
| `webhooks/store.ts` 9 | 11 (+2) |
| `minimax/manager.ts` 9 | 12 (+3) |
| `admin/read-model/helpers.ts` 9 | 15 (+6) |
| `system-integrations/store.ts` 8 | 9 (+1) |
| `internal-chat-groups.ts` 8 | same |
| `internal-agent-registry.ts` 8 | same |
| `agent-runner-generate.ts` 8 | 12 (+4) |
| `schedules/manager/store.ts` 6 | same |

New top 20 entrants (not in original top 10):
- `admin/routes.ts` 48 ⚠️ **new #1**
- `communication/internal-chat-service.ts` 45 ⚠️ **new #2**
- `agents/hiring-requests-handler.ts` 18
- `schedules/tools/tools.ts` 13

### C. Why casts grow

Common reasons for new casts being added:
1. **Cross-package type bridges** (e.g., Drizzle → domain, HTTP → domain)
2. **TypeScript narrowing limitations** (e.g., discriminating union via string field requires casts)
3. **Lazy typing** (e.g., `any` → `as unknown as Concrete` to defer type derivation)
4. **Schema inference gaps** (drizzle-orm doesn't always infer the right type)

## Phase 2 prioritization

If Phase 2 were scoped to ~1 PR (top 4 sites), the targets are:

1. **`github/manager.ts`** (18 casts) — high entry value, single domain, many `as Parameters<` wrappers (Pattern 1)
2. **`schedules/tools/tools.ts`** (13 casts) — internal tool dispatch, recently tested via #5805
3. **`minimax/manager.ts`** (12 casts) — provider wrapper, isolated domain
4. **`agents/agent-runner-generate.ts`** (12 casts) — runtime hot path

Estimated Phase 2 effort: ~3-4h for top 4 files, ~50 cast removals.

## Phase 3 tripwire candidates

For L#NN-50 family, recommend:

1. `__no-as-unknown-as.test.ts` — count `as unknown as` per file, fail if > 0 (allowlist for tests + bridges)
2. `__no-as-cast-threshold.test.ts` — count all `as X` casts per file, fail if > threshold (configurable; default 20)

Phase 3 = ~3-4h for both tripwires + tests.

## Codifications applied

- L#NN-32 v3: file-content cross-check confirmed numbers drifted since Day 17 audit (manager.ts 8/3/26 vs issue 6/4/10)
- L#NN-50 cwd fragility: workspace_write_file for full audit doc rewrite
- L#NN-19 v1.2: clean body, no file-path backticks
- L#NN-15 v1.1c: "Refs #5785" partial closure pattern (Phase 1 = audit only)

## References

- Issue #5785 — original audit (Day 17 14:00Z, 232 casts)
- `docs/quality/casts-inventory.yaml` — machine-readable inventory (this PR)
- L#NN-32 v3 — file-content cross-check protocol
- L#NN-50 tripwire family — Phase 3 candidate
- Refs #5785
