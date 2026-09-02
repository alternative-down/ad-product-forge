/**
 * @internal
 *
 * Workspace-internal entry for the `agent-runtime-core` package.
 * All 60 exports here are consumed by `packages/forge-runtime-core/`
 * but NOT by any `apps/` in this monorepo (verified D57 2026-08-26).
 *
 * See `docs/dead-exports-audit-d57-2026-08-26.md` for the full audit.
 * See issue #6703 for the original sweep findings.
 *
 * This file is marked `@internal` at file level — all exports are
 * considered workspace-internal until downstream consumer evidence
 * proves otherwise.
 */

export { AgentRuntime, type AgentRuntimeOptions } from './core/runtime.js';
export { AsyncEventChannel, type AsyncEventListener } from './core/async-event-channel.js';
export {
  RuntimeEventStream,
  type RuntimeEvent,
  type RuntimeEventListener,
} from './core/runtime-events.js';
export {
  createSequentialActionExecutionStrategy,
  createParallelActionExecutionStrategy,
  type ActionExecutionStrategy,
  type ActionExecutor,
} from './core/action-execution.js';
export { createDefaultContextFormatter, type ContextFormatter } from './core/context-formatters.js';
export {
  createImageStepContextEntry,
  createTextStepContextEntry,
  getStepContextParts,
  getStepContextText,
} from './core/step-context.js';
export {
  getStepMessageSegments,
  getStepMessageText,
  getStepNoteSegments,
  getStepNoteText,
  getStepReasoningSegments,
  getStepReasoningText,
} from './core/step-output.js';
export {
  createDefaultContinuationResolver,
  type ContinuationResolver,
} from './core/continuation.js';
export {
  createConsumeAllInputBatchingStrategy,
  createFixedSizeInputBatchingStrategy,
  type InputBatch,
  type InputBatchingStrategy,
} from './core/input-batching.js';
export {
  RuntimeActionRegistry,
  type RuntimeActionContext,
  type RuntimeActionDefinition,
} from './core/actions.js';
export { RuntimeObserverRegistry, type RuntimeObserver } from './core/observers.js';
export { RuntimePluginRegistry, type RuntimePlugin } from './core/plugins.js';
export { supportsStreamingStepModel } from './core/model.js';
export type { StepModelAdapter, StreamingStepModelAdapter } from './core/model.js';
export type {
  ActionRequest,
  ActionResult,
  RunExecutionResult,
  RuntimeInput,
  RuntimeSnapshot,
  RuntimeStatus,
  StepActionDescriptor,
  StepContentSegment,
  StepContextEntry,
  StepContextPart,
  StepContinuation,
  StepExecutionResult,
  StepModelRequest,
  StepModelResponse,
  StepModelStream,
  StepModelStreamEvent,
  StepRecord,
  RuntimeStepStream,
  RuntimeStepStreamEvent,
} from './core/types.js';
export { runtimeSnapshotSchema } from './core/snapshot-schema.js';
export { countTokens, estimateTokenCount } from './token-counter.js';
