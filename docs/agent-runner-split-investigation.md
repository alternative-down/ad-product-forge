# agent-runner.ts Split Investigation — #1718

## Current State

`apps/forge/src/agents/agent-runner.ts` — **1262 LOC**

Already reduced from 1386 LOC by prior extraction:

- `agent-runner-state.ts` — epoch/loop state helpers (a0a2268c)
- `agent-runner-context-loaders.ts` — loadAgentContextInstructions + helpers (e9112d39)

## File Structure

```
createAgentRunner() {
  // ── Store factories (lines ~71-76) ──────────────────────────
  store, systemSettings, notifications, homeMetricSnapshots, wakeQueue

  // ── Scheduler (lines ~78-94) ────────────────────────────────
  schedulerState + scheduler

  // ── Closure state (lines ~96-168) ───────────────────────────
  runtime, currentRuntime, usage, loopState, loopDetector, epochs,
  timers, various flags

  // ── Helper closures (lines ~170-628) ────────────────────────
  reloadRuntimeForNewRun     [140]  async, uses closures
  clearTimer                 [172]  thin wrapper
  startHealthcheck           [174]  thin wrapper
  clearHealthcheck           [176]  thin wrapper
  schedule                   [178]  thin wrapper
  start                      [180]  async, uses closures
  execute                    [215]  async, uses closures
  appendPendingRunMessages    [254]  thin wrapper
  flushPendingRunMessages    [263]  thin wrapper
  stop                       [269]  uses closures
  forceIdle                  [282]  async, uses closures
  runHealthcheck             [318]  async, independent logic
  beginRun                   [385]  async, uses closures
  queueNextStep              [443]  async, uses closures
  executeStep                 [487]  async, **THE CORE** (~150 lines)
  resetLoopDetector           [634]  thin wrapper
  resetRunLastMessages       [638]  async, thin wrapper
  refreshRunFlushSettings     [653]  async, thin wrapper
  registerLoopSignature      [662]  thin wrapper
  planNextAttempt            [666]  async, uses closures
  calculateDelayMs           [727]  pure utility
  nextBackoff                [746]  thin wrapper
  getSnapshot                [752]  reads closures, produces state snapshot

  return { start, stop, forceIdle, execute, getSnapshot, notifyExternalEvent };

  // ── Post-return (lines ~783-1262) ──────────────────────────
  // NOT exported; can only use closures from above.
  // Cannot be extracted as standalone modules without major parameterization.
  // Kept here because they depend on runtime state.

  generateWithTimeoutRetries [783]  async, ~280 lines, **THE BOTTLENECK**
    - Calls: currentRuntime, runtime.id, activeRunId, usage, homeMetricSnapshots,
      scheduler, systemSettings, store, loopDetector, messageManager
    - Contains inline callbacks: prepareStep, onStepFinish, onIterationComplete
    - NOT extractable without passing all closure state as parameters

  loadAgentContextInstructions [1064]  thin wrapper → agent-runner-context-loaders.ts
  notifyExternalEvent          [1070]  ~12 lines, could move pre-return
  startNewRunEpoch             [1082]  ~8 lines, uses closures
  isStaleRun                   [1092]  pure predicate
  isLocallyIdle                [1096]  pure predicate
  transitionToIdle              [1100]  async, ~36 lines, uses closures
  invalidateInFlightGenerate   [1136]  ~5 lines, uses closures
  startGenerateAttempt         [1142]  ~7 lines, uses closures
  finishGenerateAttempt        [1149]  ~10 lines, uses closures
  planCurrentRunDelayMs        [1159]  async, ~30 lines, uses closures
  createGenerateTimeoutGuard    [1190]  ~18 lines, creates object
  touchGenerateTimeout          [1209]  ~23 lines, uses closures (lastGenerateProgress)
  markGenerateProgress          [1233]  ~18 lines, uses closures
  clearGenerateTimeout          [1252]  ~8 lines, pure (clears timeout)
}
```

## Extraction Candidates

### Phase 1: Move post-return → pre-return

**Low effort, medium value** — eliminates the misleading "after return" block structure.

- Move ALL post-return functions before `return { ... }`
- No logic changes, no new files
- Makes `return` the final statement
- Reduces cognitive confusion about what's exported vs internal

### Phase 2: Extract executeStep

**Medium effort, high value** — `executeStep` is ~150 lines, distinct from `beginRun`.

- Create `agent-runner-execute.ts`
- Pass all dependencies as parameters: db, runtime, currentRuntime, store,
  scheduler, messageManager, loopDetector, usage, homeMetricSnapshots, etc.
- Tests can mock at parameter level
- ~150 lines extracted, clean interface

### Phase 3: Break generateWithTimeoutRetries into sub-functions

**High effort, high value** — the ~280 line function is the main bottleneck.

- Extract `buildIterationFeedback` — constructs feedback messages from iteration
- Extract `handleIterationComplete` — main iteration callback logic
- Extract `executeGenerateStep` — the Promise.race body
- Each remains in same file (closure-dependent), but organized

### Phase 4: Extract generate timeout management

**Low-medium effort** — only the pure timeout helpers could move to a module.

- `createGenerateTimeoutGuard`, `touchGenerateTimeout`, `markGenerateProgress`,
  `clearGenerateTimeout` → `agent-runner-timeout.ts`
- Some depend on `lastGenerateProgress` closure — would need refactoring

## Recommendation

**Phase 1 (Move post-return → pre-return)** is the best immediate step:

- Zero risk, pure refactor
- Eliminates the misleading "after return" pattern
- Does NOT reduce LOC but improves code organization
- Can be done in one commit, easily reviewable

**Phase 2 (Extract executeStep)** is the real extraction:

- Requires careful dependency mapping
- ~150 lines with clear interface
- Similar approach to how internal-chat-service was split

## Constraints

- All post-return functions depend on closure state from pre-return
- Cannot extract as standalone modules without major parameterization
- `generateWithTimeoutRetries` is the core — it's monolithically tied to the closure
