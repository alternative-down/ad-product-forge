# Analysis: agents/ co-specificity — #1148

## Context

Issue #1148 asks to identify the worst co-specificity offenders in `apps/forge/src/agents/` and propose consolidation or extraction. 46 .ts source files (no test) in a flat namespace.

---

## Current State

| Pattern | Files | Lines (src) | Exports |
|---------|-------|-------------|---------|
| `agent-runtime-*` | 4 | 697 | 5 functions + 15 types |
| `agent-runner-*` | 8 | 2,003 | 1 main class + 6 helpers |
| `agent-long-term-memory*` | 4 | 1,770 | 4 modules |
| `agent-loader*` | 4 | 168 | 4 modules |
| `agent-home-metrics*` | 2 | 602 | 6 functions |
| `hiring-rh.ts` | 1 | 588 | 1 function |
| `agent-contract*.ts` | 2 | 315 | store |
| `skills*`, `workspace-skills*` | 4 | 1,065 | 3 modules |
| flat singles | ~20 | varies | 1-2 functions each |

---

## Proposals

### Tier 1 — Rename / Namespace (Safe, Low Risk)

#### 1. `hiring-rh.ts` → `hiring-requests-handler.ts`
**Why:** 588 lines, exports 1 function: `generateHiredAgentInstructions`. Filename `hiring-rh` is opaque. The exported function name already reflects what it does — rename the file to match.

**Action:** `mv hiring-rh.ts hiring-requests-handler.ts` — trivial, only internal references need update.

#### 2. `agent-runtime-*` → `runtime/` subdirectory
**Why:** 4 files sharing the `agent-runtime-` prefix (platform, memory, prompt, types). They are coherent as a group — all belong to the agent runtime subsystem. A flat namespace makes imports harder to scan.

**Proposed structure:**
```
agents/runtime/
  platform.ts        (from agent-runtime-platform.ts)
  memory.ts         (from agent-runtime-memory.ts)
  prompt.ts         (from agent-runtime-prompt.ts)
  types.ts          (from agent-runtime-types.ts)
```

**Action:** Create `runtime/` directory, move files, update all import paths. Types file stays as the shared interface. This is a directory rename + import path update — straightforward but touches all consumers.

#### 3. `agent-long-term-memory*` → `ltm/` subdirectory
**Why:** 4 files, same prefix. Clear domain boundary (LTM). Two distinct sub-responsibilities:
- **store:** SQLite persistence
- **recall:** query optimization and vector search

**Proposed structure:**
```
agents/ltm/
  store.ts          (agent-long-term-memory-store.ts)
  recall.ts         (agent-long-term-memory-recall.ts)
  index.ts          (agent-long-term-memory.ts — re-export from store + recall)
  ltm-helpers.ts    (agent-ltm-helpers.ts)
```

**Action:** Create `ltm/` directory, restructure, update imports. The main `agent-long-term-memory.ts` becomes a barrel file.

---

### Tier 2 — Extract Shared Helpers (Moderate)

#### 4. `withTimeout` duplication
**Where:** `agent-runner-context.ts:98`, `agent-runner-helpers.ts:10`, `agent-runner-scheduler.ts:667`, `agent-home-metrics.ts:100`

All implement the same pattern: wrap a promise, reject after `ms` if not resolved.

**Proposed:** Extract to `agents/shared/promise-utils.ts`:
```ts
export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T>
```

**Action:** Create shared file, replace usages, update imports. Safe — signature is identical everywhere.

#### 5. `agent-runner-helpers.ts` — 378 lines, 7 exported helpers
**Why:** Mixes concerns: error serialization, step prompt building, loop signature. The helpers aren't tightly coupled — they could be organized by purpose.

**Potential split:**
- `agent-runner-errors.ts` — `serializeError`, `serializeUnknown`, `extractAbsentErrorDetails`, `formatAbsentErrorDetailValue`
- `agent-runner-step-prompt.ts` — `buildStepSystemPrompt`, `buildIterationLoopSignature`
- `agent-runner-control.ts` — `extractRunnerControlDirective`, `formatAbsentExecutionError`

Or: keep as-is since all are runner-internal and no single file is oversized (378 lines is acceptable).

**Recommendation:** Low priority. Keep. The cohesion is acceptable.

---

### Tier 3 — Large Files (High Complexity, Consider Future)

#### 6. `agent-runner.ts` — 1,308 lines
**Current:** Single giant module. Handles agent lifecycle, run loop, wake events, usage tracking.

**Observation:** Already partially split into `agent-runner-scheduler.ts`, `agent-runner-context.ts`, `agent-runner-messages.ts`, etc. The main file orchestrates these.

**Recommendation:** The current split is already reasonable. Further splitting `agent-runner.ts` is risky without deep understanding of the call graph. Not recommended for this exercise.

#### 7. `agent-long-term-memory-recall.ts` — 1,220 lines
**Current:** Single large module handling recall from step/cycle/all + vector search setup.

**Recommendation:** Already identified in Tier 1 as the `ltm/` split. That addresses this.

---

## Recommended Priority

| # | Action | Risk | Impact |
|---|--------|------|--------|
| 1 | `hiring-rh.ts` rename | Trivial | Naming clarity |
| 2 | `withTimeout` extraction | Low | 4 files, shared pattern |
| 3 | `runtime/` subdirectory | Medium | Import path updates |
| 4 | `ltm/` subdirectory | Medium | Import path updates |
| 5 | `agent-runner-helpers` split | Low | Optional, low benefit |

---

## Summary

The worst offenders are naming/namespace issues, not code quality issues:

1. **Clearest win:** `hiring-rh.ts` — 1 exported function, opaque name → rename to `hiring-requests-handler.ts`
2. **Best structural fix:** `runtime/` and `ltm/` subdirectories — 8 files with shared prefix organized into coherent domains
3. **Easy win:** `withTimeout` deduplication — same pattern in 4 files, extract to shared utility
4. **Accept current:** `agent-runner.ts` (1,308 lines) is already partially split and shouldn't be further fragmented without deep call-graph analysis