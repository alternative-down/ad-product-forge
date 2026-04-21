import type { StepContentSegment, StepModelResponse, StepRecord } from './types.js';
export declare function getStepMessageSegments(input: StepRecord | StepModelResponse): StepContentSegment[];
export declare function getStepReasoningSegments(input: StepRecord | StepModelResponse): StepContentSegment[];
export declare function getStepNoteSegments(input: StepRecord | StepModelResponse): StepContentSegment[];
export declare function getStepMessageText(input: StepRecord | StepModelResponse): string;
export declare function getStepReasoningText(input: StepRecord | StepModelResponse): string;
export declare function getStepNoteText(input: StepRecord | StepModelResponse): string;
