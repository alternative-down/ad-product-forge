# #2323 — agent-long-term-memory.ts Extraction Plan

## Audit Summary

`agent-long-term-memory.ts` (730 LOC initially) exports `createAgentLongTermMemory` factory.
All helpers extracted to focused modules. Progress:

### Completed Phases

| Phase | File | LOC | PR | Status |
|-------|------|-----|-----|--------|
| 1 | `agent-ltm-generate-helpers.ts` | 70 | #2689 | merged |
| 2 | `agent-ltm-checkpoint-render.ts` | 33 | #2691 | open |

**agent-long-term-memory.ts**: 730 → 579 LOC (-151)

### Phase 1: Prompt Generation (`agent-ltm-generate-helpers.ts`, 70 LOC)
- `LtmUsage`, `LtmSnapshot` types
- `createMemoryAgentInstructions()` — pure string builder
- `getUsageFromGenerateResult()` — token extraction
- **12 tests passing**

### Phase 2: Checkpoint Rendering (`agent-ltm-checkpoint-render.ts`, 33 LOC)
- `renderCheckpointPackageReadme()` — summary text with trailing newline
- `renderReflectionFile()` — frontmatter + trimmed content
- `renderObservationFile()` — frontmatter + trimmed content
- **9 tests passing**

---

## Remaining Phases

### Phase 3: State Management (~26 LOC, no deps)
**File**: `agent-ltm-state.ts`
- `readState()` — reads from `persistenceStore`
- `writeState(state: LongTermMemoryState)` — writes to `persistenceStore`
- `markRecallIndexDirty(reason)` — marks dirty + triggers refresh

### Phase 4: Checkpoint Writing (~211 LOC, depends on phase 3)
**File**: `agent-ltm-checkpoint.ts`
- `writeCheckpointPackage(payload)` — full checkpoint write logic
- Largest single function in the file

### Phase 5: Run Orchestration (~280 LOC, depends on phases 1-4)
**File**: `agent-ltm-run.ts`
- `clearTimer()` — cancel pending run timer
- `ensureInitialized()` — first-run init
- `estimateNextLtmDelayMs()` — budget-aware delay
- `recordLtmStep(usage)` — log step usage
- `generateLtmRun(prompt)` — execute generation + retry
- `runMemoryWorkflow()` — orchestrate: snapshot → generate → write → index

### Phase 6: Factory + Surface (~220 LOC)
**File**: `agent-long-term-memory.ts` (remaining)
- `createAgentLongTermMemory(input)` — factory
- All closure state
- Public API

---

## Risks

- **Closure captures**: factory state (`idle`, `running`, `stopped`, etc.) lives in the factory.
  Phases 3–5 must receive state as a deps object or interface.
- **`getBudgetContext`**: defined inside factory, used by phases 4–5. Will extract
  with phase 5.
- **Pre-existing TS errors**: ~1700 TS errors in codebase. All new files are TS-clean.
  The refactored main file introduces no new errors.

## Workspace Memory Files
- `docs/2323-ltm-extraction-plan.md` — this file (updated each phase)
- `memory/session-2026-05-14-late-morning.md` — session history