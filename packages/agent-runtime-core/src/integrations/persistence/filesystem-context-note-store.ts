import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createTextStepContextEntry } from '../../core/step-context.js';
import type { StepContextEntry } from '../../core/types.js';
import type { ContextNote, ContextNoteStore } from '../state/context-note-store.js';

export type FilesystemContextNoteStoreOptions = {
  basePath: string;
};

export class FilesystemContextNoteStore implements ContextNoteStore {
  private readonly basePath: string;

  constructor(options: FilesystemContextNoteStoreOptions) {
    this.basePath = options.basePath;
  }

  async set(runtimeId: string, note: ContextNote): Promise<void> {
    const notes = await this.readNotes(runtimeId);
    const nextNotes = notes.filter((entry) => entry.id !== note.id);
    nextNotes.push(note);
    await this.writeNotes(runtimeId, nextNotes);
  }

  async remove(runtimeId: string, noteId: string): Promise<void> {
    const notes = await this.readNotes(runtimeId);
    await this.writeNotes(runtimeId, notes.filter((note) => note.id !== noteId));
  }

  async list(runtimeId: string): Promise<StepContextEntry[]> {
    const notes = await this.readNotes(runtimeId);

    return notes.map((note) => createTextStepContextEntry({
      id: note.id,
      kind: note.kind ?? 'context-note',
      title: note.title,
      text: note.text,
    }));
  }

  private async readNotes(runtimeId: string) {
    const filePath = this.getFilePath(runtimeId);

    try {
      const file = await readFile(filePath, 'utf8');
      return JSON.parse(file) as ContextNote[];
    } catch {
      return [];
    }
  }

  private async writeNotes(runtimeId: string, notes: ContextNote[]) {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(this.getFilePath(runtimeId), JSON.stringify(notes, null, 2), 'utf8');
  }

  private getFilePath(runtimeId: string) {
    return join(this.basePath, `${runtimeId}.notes.json`);
  }
}
