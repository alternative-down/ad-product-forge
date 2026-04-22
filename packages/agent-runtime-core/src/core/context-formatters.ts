import { createTextStepContextEntry } from './step-context.js';
import type { ActionResult, RuntimeInput, StepContextEntry } from './types.js';

export type ContextFormatter = {
  formatInput(input: RuntimeInput): StepContextEntry | null;
  formatActionResults(previousStepNumber: number, actionResults: ActionResult[]): StepContextEntry;
};

export function createDefaultContextFormatter(): ContextFormatter {
  return {
    formatInput(input) {
      return createTextStepContextEntry({
        id: input.id,
        kind: `input:${input.type}`,
        title: `Input ${input.type}`,
        text: JSON.stringify(input.payload, null, 2),
      });
    },
    formatActionResults(previousStepNumber, actionResults) {
      return createTextStepContextEntry({
        id: `action-results:${previousStepNumber}`,
        kind: 'action-results',
        title: 'Previous action results',
        text: JSON.stringify(actionResults, null, 2),
        data: actionResults,
      });
    },
  };
}
