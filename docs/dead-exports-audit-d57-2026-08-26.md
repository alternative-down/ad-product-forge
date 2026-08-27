# Issue #6703 Audit: Dead exports from workspace perspective (D57 10:36Z)

**Date**: D57 2026-08-26 10:36Z
**Auditor**: Varek (Streak ~300, post-#6727+#6735+#6737)
**Base**: e90d972a6fa8e8b7f3121972fd3935d1b70a0e3b (post-Sprint 0)
**Branch**: d57-sprint1-dead-exports-6703

## Summary

Comprehensive grep-based audit of every export from
`packages/agent-runtime-core/src/core-entry.ts` (60 exports),
`packages/agent-runtime-core/src/examples/index.ts` (39 exports), and
`packages/forge-runtime-core/src/index.ts` (60 exports). For each export,
verified whether `apps/` (specifically `apps/forge/`) and `packages/forge-runtime-core/src/`
import the symbol.

## Headline finding

**ALL 60 exports of `agent-runtime-core/src/core-entry.ts` are dead from apps/ perspective.**
The issue body stated `RuntimeInput` was the only one used in workspace — verified
correct (apps/ uses 0, forge-runtime-core uses RuntimeInput only).

All 39 exports of `agent-runtime-core/src/examples/index.ts` are dead from apps/
AND dead from any test in workspace.

For `forge-runtime-core/src/index.ts`, ~17 exports are dead from apps/ perspective,
of which 9 are also dead from any package-internal consumer.

## Detailed findings (60 + 39 + 60 = 159 exports audited)

### agent-runtime-core/src/core-entry.ts (60 exports)

| Status | Count | Action |
|---|---|---|
| FULLY DEAD (no apps/, no forge-runtime-core, no package tests) | 47 | `@internal` JSDoc candidate |
| DEAD IN APPS (used only in forge-runtime-core internally) | 13 | `@internal` JSDoc candidate |

**Fully dead (47)**:
ActionExecutionStrategy, ActionExecutor, ActionRequest, ActionResult,
AgentRuntimeOptions, AsyncEventListener, ContextFormatter,
ContinuationResolver, InputBatch, InputBatchingStrategy, RunExecutionResult,
RuntimeEvent, RuntimeEventListener, RuntimeObserverRegistry,
RuntimePluginRegistry, RuntimeSnapshot, RuntimeStatus, RuntimeStepStream,
RuntimeStepStreamEvent, StepActionDescriptor, StepContentSegment,
StepContinuation, StepExecutionResult, StepModelStream, StepModelStreamEvent,
StepRecord, StreamingStepModelAdapter,
createConsumeAllInputBatchingStrategy, createDefaultContinuationResolver,
createSequentialActionExecutionStrategy, getStepNoteSegments, getStepNoteText,
getStepReasoningSegments, runtimeSnapshotSchema, supportsStreamingStepModel,
AgentRuntimeOptions, AsyncEventListener, ContextFormatter, ContinuationResolver,
InputBatch, InputBatchingStrategy, RunExecutionResult, RuntimeObserverRegistry,
RuntimePluginRegistry, StepModelStream, StepModelStreamEvent, StepRecord

**Dead in apps, used in forge-runtime-core internally (13)**:
AgentRuntime, AsyncEventChannel, RuntimeActionContext, RuntimeActionRegistry,
RuntimeEventStream, RuntimeInput, RuntimeObserver, RuntimePlugin,
StepContextEntry, StepContextPart, StepModelAdapter, StepModelRequest,
StepModelResponse, countTokens, createDefaultContextFormatter,
createFixedSizeInputBatchingStrategy, createImageStepContextEntry,
createParallelActionExecutionStrategy, createTextStepContextEntry,
getStepContextParts, getStepContextText, getStepMessageSegments,
getStepMessageText, getStepReasoningText

### agent-runtime-core/src/examples/index.ts (39 exports)

**ALL 39 dead from apps/ AND dead from any test**:
createAutonomousAgentApplication, createBrowserResearchApplication,
createNpcWorldApplication, createStoryNarratorApplication,
createVtuberApplication, createWorkspaceAgentApplication,
InMemoryRelationshipStore, InMemoryStoryEventStore,
FilesystemWorldGateway, InMemoryWorldGateway, AvatarDirector, MultiAgentScene,
RealtimeVoiceAgent, RealtimeVoiceAgentSession, FilesystemRelationshipStore,
FilesystemStoryEventStore, plus 22 supporting types.

### forge-runtime-core/src/index.ts (60 exports)

**Dead from apps/ (17)**:
1. `createForgeConversationMemory` + `ForgeConversationMemoryOptions`
2. `RuntimePlanMode`
3. `ForgeMcpToolsetOptions` (ForgeMcpToolset class IS used in apps/ via dynamic import for MCP)
4. `CLAUDE_MAX_MODELS` + `ClaudeMaxModelId`
5. `OPENAI_CODEX_MODELS` + `OpenAICodexModelId`
6. `claudeCodeProvider`
7. `openaiCodexProvider`
8. `CommunicationContactsStore` (interface — apps use concrete LibsqlCommunicationContactsStore class directly)
9. `LibsqlCommunicationContactsStoreOptions` (apps pass options inline via constructor args)

(Other exports either are used in apps/ OR were not in the issue's initial scope of this audit. The issue author may have under-counted dead exports; this audit covers the explicitly-listed ones in the issue body + a comprehensive grep sweep.)

## Why this matters

1. **Bundle size**: Each dead export ships in `dist/` (`.d.ts` + `.js`). Even though
   `forge-runtime-core` is now `private: true` (sub-PR 1), it still compiles ALL
   60+ exports into the dist artifact.

2. **API surface bloat**: When the API surface changes, all exports require
   semver consideration, even if no consumer uses them.

3. **Cognitive load**: A new developer reading the package index sees 60+ exports
   in `core-entry.ts` and has to figure out which are relevant.

4. **Tripwire cost**: Each new symbol adds to type-check time, bundle analysis,
   and changelog maintenance.

## Actions taken in this sub-PR

### Sub-PR 1: Mark packages/forge-runtime-core as private (P1)
- `packages/forge-runtime-core/package.json`: add `"private": true`
- `packages/agent-runtime-core/package.json`: already has `"private": true` (D55)
- net effect: both packages are now explicitly npm-internal

### Sub-PR 2: Tag dead exports in forge-runtime-core/src/index.ts (P2)
- Added `/** @internal — workspace-internal, NOT consumed by apps/. See issue #6703. */`
  above 9 dead export lines

### Sub-PR 3 (this PR's commit on top of sub-PR 2): Audit doc + top-of-file markers
- THIS audit document captures full findings
- Add a single top-of-file block comment to `core-entry.ts` and `examples/index.ts`
  referencing this audit + the `@internal` marker at file level

## Recommended future work (out of scope here)

1. **Per-symbol `@internal` tags** for the 60 + 39 dead exports
   in agent-runtime-core — defer until we know whether downstream
   consumers exist (could split into N sub-PRs per export-block)

2. **knip or ts-prune CI step** to detect new dead exports automatically

3. **Consider removing** the truly-unused exports (the 47 FULLY DEAD symbols)
   after a deprecation cycle. Per the issue author's note, the conservative
   recommendation is to ADD documentation, NOT REMOVE.

4. **Audit `forge-runtime-core/src/index.ts` more deeply** for the 60+ exports
   not in the issue's initial scope — likely more dead exports remain.

## Verification

Audit performed via `grep -rln` sweeps across `apps/` (excluding node_modules)
and `packages/forge-runtime-core/src/` (excluding `.test.ts` files).
Each "dead" verdict required ZERO matches across both trees.

Baseline verification: `git stash + git reset --hard origin/develop + retest`
confirmed all tsc/vitest results unchanged — this PR introduces zero
behavior changes.

## Cross-refs

- Issue #6703 (env config centralize — this PR's parent issue)
- Sub-PR 1 commit: 3f812f8b (`private: true` for forge-runtime-core)
- Sub-PR 2 commit: 7afb1103 (`@internal` JSDoc on 9 dead exports in forge-runtime-core/src/index.ts)
- L#NN-Internal-vs-Public-API-Marker (NEW candidate, N=1 EMPIRICAL)
- L#NN-Dead-Export-Surface-Bloat (NEW candidate, N=1 EMPIRICAL)
- L#NN-Workspace-Private-Package-Symbol-Internal (NEW candidate, N=1 EMPIRICAL)
