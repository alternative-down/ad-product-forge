import {
  applyStepModelMiddlewares,
  type StepModelMiddleware,
} from '../adapters/model-middleware.js';
import type { RuntimeActionDefinition } from '../../core/actions.js';
import { RuntimeEventStream } from '../../core/runtime-events.js';
import { AgentRuntime, type AgentRuntimeOptions } from '../../core/runtime.js';
import type { RuntimeObserver } from '../../core/observers.js';
import type { RuntimePlugin } from '../../core/plugins.js';
import { createContextNotesPlugin } from '../extensions/context-notes.js';
import { createRuntimeJournalPlugin } from '../extensions/runtime-journal.js';
import { createRuntimeSnapshotObserver } from '../extensions/runtime-snapshot-observer.js';
import { RuntimeMessageStream } from '../runtime/runtime-message-stream.js';
import type { RuntimeJournal } from '../journal/contracts.js';
import { InMemoryRuntimeJournal } from '../journal/in-memory-runtime-journal.js';
import type { RuntimeSnapshotStore } from '../persistence/runtime-snapshot-store.js';
import { InMemoryRuntimeScheduler } from '../scheduler/in-memory-runtime-scheduler.js';
import type { ContextNoteStore } from '../state/context-note-store.js';
import { InMemoryContextNoteStore } from '../state/context-note-store.js';

export type RuntimeHostOptions = {
  runtime: AgentRuntimeOptions;
  scheduler?: boolean;
  journal?: RuntimeJournal;
  notes?: ContextNoteStore;
  schedulerInstance?: InMemoryRuntimeScheduler;
  snapshotStore?: RuntimeSnapshotStore;
  plugins?: RuntimePlugin[];
  observers?: RuntimeObserver[];
  actions?: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
  eventStream?: RuntimeEventStream | true;
  messageStream?: RuntimeMessageStream | true;
  modelMiddlewares?: StepModelMiddleware[];
};

export type RuntimeHost = {
  runtime: AgentRuntime;
  journal: RuntimeJournal;
  notes: ContextNoteStore;
  scheduler: InMemoryRuntimeScheduler | null;
  snapshotStore: RuntimeSnapshotStore | null;
  eventStream: RuntimeEventStream | null;
  messageStream: RuntimeMessageStream | null;
  saveSnapshot(): Promise<void>;
  restoreSnapshot(): Promise<boolean>;
};

export function createRuntimeHost(options: RuntimeHostOptions): RuntimeHost {
  const runtimeOptions: AgentRuntimeOptions = options.modelMiddlewares != null && options.modelMiddlewares.length > 0
    ? {
        ...options.runtime,
        model: applyStepModelMiddlewares(options.runtime.model, options.modelMiddlewares),
      }
    : options.runtime;
  const runtime = new AgentRuntime(runtimeOptions);
  const journal = options.journal ?? new InMemoryRuntimeJournal();
  const notes = options.notes ?? new InMemoryContextNoteStore();
  const scheduler =
    options.schedulerInstance ?? (options.scheduler != null ? new InMemoryRuntimeScheduler() : null);
  const snapshotStore = options.snapshotStore ?? null;
  const eventStream =
    options.eventStream === true || options.messageStream === true
      ? options.eventStream instanceof RuntimeEventStream
        ? options.eventStream
        : new RuntimeEventStream()
      : (options.eventStream ?? null);
  const messageStream =
    options.messageStream === true
      ? new RuntimeMessageStream({
          subscribe: eventStream!.subscribe.bind(eventStream),
        })
      : (options.messageStream ?? null);

  runtime.use(createRuntimeJournalPlugin({ journal }));
  runtime.use(createContextNotesPlugin({ store: notes }));
  for (const action of options.actions ?? []) {
    runtime.registerAction(action);
  }
  for (const plugin of options.plugins ?? []) {
    runtime.use(plugin);
  }
  for (const observer of options.observers ?? []) {
    runtime.observe(observer);
  }
  if (eventStream) {
    runtime.observe(eventStream.createObserver());
  }
  if (snapshotStore) {
    runtime.observe(createRuntimeSnapshotObserver({ store: snapshotStore }));
  }

  return {
    runtime,
    journal,
    notes,
    scheduler,
    snapshotStore,
    eventStream,
    messageStream,
    async saveSnapshot() {
      if (!snapshotStore) {
        return;
      }

      await snapshotStore.write(runtime.getSnapshot());
    },
    async restoreSnapshot() {
      if (!snapshotStore) {
        return false;
      }

      const snapshot = await snapshotStore.read(runtime.getSnapshot().runtimeId);

      if (!snapshot) {
        return false;
      }

      runtime.restoreSnapshot(snapshot);
      return true;
    },
  };
}
