import type { StepContextEntry, StepContextPart } from './types.js';
export declare function createTextStepContextEntry(input: {
    id: string;
    kind: string;
    title: string;
    text: string;
}): StepContextEntry;
export declare function createImageStepContextEntry(input: {
    id: string;
    kind: string;
    title: string;
    mimeType: string;
    bytes: Uint8Array;
    text?: string;
}): StepContextEntry;
export declare function getStepContextParts(entry: StepContextEntry): StepContextPart[];
export declare function getStepContextText(entry: StepContextEntry): string;
