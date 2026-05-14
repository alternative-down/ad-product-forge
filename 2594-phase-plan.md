# #2594 Phase Plan: agent-runner.ts decomposition

## Status

| Phase | Target | Status |
|-------|--------|--------|
| Phase 1 | `agent-runner-epoch-manager.ts` (state objects) | ✅ Merged #2613 |
| Phase 2 | `agent-runner-loop-manager.ts` + `agent-runner-message-manager-state.ts` | 🔄 In Progress |
| Phase 3 | `beginRun`, `executeStep`, `queueNextStep`, `planNextAttempt` | 📋 Pending |
| Phase 4 | `transitionToIdle`, `isStaleRun`, `isLocallyIdle`, `notifyExternalEvent`, `reloadRuntimeForNewRun` | 📋 Pending |

## Phase 2 — Loop State + Message Manager State

### Loop State (`loopState` + `loopDetector`)

**Current location**: agent-runner.ts lines 130-131
```typescript
const loopState: { lastLoopSignature: string | null; repeatedLoopCount: number } = { lastLoopSignature: null, repeatedLoopCount: 0 };
const loopDetector = createLoopDetector(loopState);
```

**Extracted to**: `agent-runner-loop-manager.ts`

Functions to extract:
- `resetLoopDetector()` → calls `loopDetector.reset()`
- `registerLoopSignature(signature: string)` → calls `loopDetector.register(signature)`
- Helper to check `isStuck()` → calls `loopDetector.isStuck()`

Key insight: `createLoopDetector` already exists in `agent-runner-loop-detector.ts`. Phase 2 wraps it with a manager that holds both `loopState` and `loopDetector`.

### Message Manager State (`messageManagerState` + `messageManager`)

**Current location**: agent-runner.ts lines 139-149
```typescript
const messageManagerState: MessageManagerState = {
  flushedRunEventKeys: new Set<string>(),
  flushedRunEventKeyOrder: [] as string[],
  currentFlushSettings: { communicationDmFlushingEnabled: true, communicationGroupFlushingEnabled: true },
  pendingRunMessages: new Map<string, AgentWakeEvent>(),
};
const messageManager = createMessageManager(messageManagerState, formatPendingRunEvents);
```

**Extracted to**: `agent-runner-message-manager.ts` (extends existing `agent-runner-messages.ts`)

Functions to extract:
- `appendPendingRunMessages(events, options)` → delegates to `messageManager.appendPendingRunMessages`
- `flushPendingRunMessages(options)` → delegates to `messageManager.flushPendingRunMessages`
- State reset on `forceIdle`: clears `pendingRunMessages` + calls `messageManager.resetFlushedRunEventKeys()`
- State reset on `stop`: clears `pendingRunMessages` + calls `messageManager.resetFlushedRunEventKeys()`

Key insight: `createMessageManager` already exists in `agent-runner-messages.ts`. Phase 2 wraps it with state management that lives in the runner module.

## Phase 3 — Run Orchestration

Functions that all read/write all mutable closures: `beginRun`, `executeStep`, `queueNextStep`, `planNextAttempt`.

This is the hardest extraction because:
1. All 5 state objects are referenced here
2. `runLastMessages`, `lastGenerateProgress`, `pendingLongTermMemoryRecallSystemText`, `currentGenerateAbortController`, `instant`, `stopped`, `startingRun`, `executing` all used
3. Forward reference: `execute` referenced before definition

Approach: Extract step orchestration to `agent-runner-step-orchestrator.ts`, thread state objects as parameters.

**Priority**: Phase 1 proved that state objects are the right extraction boundary. Phase 3 should thread `epochState`, `backoffState`, `schedulerState`, `loopState`, `messageManagerState` through all extracted modules.

## Phase 4 — Lifecycle + Notification

Relatively isolated from state mutations:
- `transitionToIdle` (writes: epochState, instant, backoffState)
- `isStaleRun` (reads: stopped, activeRunEpoch)
- `isLocallyIdle` (reads: startingRun, executing, timer)
- `notifyExternalEvent` (reads: stopped, instant; writes: wakeQueue)
- `reloadRuntimeForNewRun` (writes: currentRuntime, usage)

## Open Issues

### TDZ Forward Reference (flagged separately)

```typescript
const wakeQueue = createAgentWakeQueue({
  label: currentRuntime.id,
  execute,  // ← execute not defined yet — same TDZ pattern as #2596
});
```

This needs its own analysis. Do NOT solve within Phase 2 or 3.

### Backpressure: isStaleRun in agent-runner.ts

Line 809: `function isStaleRun(runEpoch: number) { return stopped || runEpoch !== activeRunEpoch; }`

Should be: `isStaleRun(epochState, runEpoch)` using the extracted function from epoch-manager. But `activeRunEpoch` is a `let` binding, not part of `epochState.activeRunEpoch`. Needs threading in Phase 3.

### `InternalAgentRunner` export

Line 857: must remain stable throughout all phases.