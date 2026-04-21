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
export declare class InMemoryContextNoteStore implements ContextNoteStore {
    private readonly state;
    set(runtimeId: string, note: ContextNote): Promise<void>;
    remove(runtimeId: string, noteId: string): Promise<void>;
    list(runtimeId: string): Promise<StepContextEntry[]>;
    private getOrCreateState;
}
