import { createTextStepContextEntry } from '../../core/step-context.js';
import type { StepContextEntry } from '../../core/types.js';

export type ContextNote = {
  id: string;
  kind?: string;
  title: string;
  text: string;
};

export interface ContextNoteStore {
  set(runtimeId: string, note: ContextNote): Promise<void>;
  remove(runtimeId: string, noteId: string): Promise<void>;
  list(runtimeId: string): Promise<StepContextEntry[]>;
}

type RuntimeNotesState = {
  notes: Map<string, ContextNote>;
};

export class InMemoryContextNoteStore implements ContextNoteStore {
  private readonly state = new Map<string, RuntimeNotesState>();

  async set(runtimeId: string, note: ContextNote): Promise<void> {
    const runtimeState = this.getOrCreateState(runtimeId);
    runtimeState.notes.set(note.id, note);
  }

  async remove(runtimeId: string, noteId: string): Promise<void> {
    const runtimeState = this.getOrCreateState(runtimeId);
    runtimeState.notes.delete(noteId);
  }

  async list(runtimeId: string): Promise<StepContextEntry[]> {
    const runtimeState = this.getOrCreateState(runtimeId);

    return Array.from(runtimeState.notes.values(), (note) => createTextStepContextEntry({
      id: note.id,
      kind: note.kind ?? 'context-note',
      title: note.title,
      text: note.text,
    }));
  }

  private getOrCreateState(runtimeId: string) {
    const existing = this.state.get(runtimeId);

    if (existing) {
      return existing;
    }

    const created: RuntimeNotesState = {
      notes: new Map(),
    };

    this.state.set(runtimeId, created);
    return created;
  }
}
