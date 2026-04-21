import type { ActionResult, RuntimeInput, StepContextEntry } from './types.js';
export type ContextFormatter = {
    formatInput(input: RuntimeInput): StepContextEntry;
    formatActionResults(previousStepNumber: number, actionResults: ActionResult[]): StepContextEntry;
};
export declare function createDefaultContextFormatter(): ContextFormatter;
