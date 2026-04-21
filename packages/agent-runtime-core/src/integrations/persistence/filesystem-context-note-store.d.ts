import type { StepContextEntry } from '../../core/types.js';
import type { ContextNote, ContextNoteStore } from '../state/context-note-store.js';
export type FilesystemContextNoteStoreOptions = {
    basePath: string;
};
export declare class FilesystemContextNoteStore implements ContextNoteStore {
    private readonly basePath;
    constructor(options: FilesystemContextNoteStoreOptions);
    set(runtimeId: string, note: ContextNote): Promise<void>;
    remove(runtimeId: string, noteId: string): Promise<void>;
    list(runtimeId: string): Promise<StepContextEntry[]>;
    private readNotes;
    private writeNotes;
    private getFilePath;
}
