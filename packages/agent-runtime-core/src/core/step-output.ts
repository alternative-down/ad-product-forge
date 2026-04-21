import type { StepContentSegment, StepModelResponse, StepRecord } from './types.js';

export function getStepMessageSegments(input: StepRecord | StepModelResponse): StepContentSegment[] {
  return getSegments(input).filter((segment) => segment.kind === 'message');
}

export function getStepReasoningSegments(input: StepRecord | StepModelResponse): StepContentSegment[] {
  return getSegments(input).filter((segment) => segment.kind === 'reasoning');
}

export function getStepNoteSegments(input: StepRecord | StepModelResponse): StepContentSegment[] {
  return getSegments(input).filter((segment) => segment.kind === 'note');
}

export function getStepMessageText(input: StepRecord | StepModelResponse) {
  return getStepMessageSegments(input)
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join('\n')
    .trim();
}

export function getStepReasoningText(input: StepRecord | StepModelResponse) {
  return getStepReasoningSegments(input)
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join('\n')
    .trim();
}

export function getStepNoteText(input: StepRecord | StepModelResponse) {
  return getStepNoteSegments(input)
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join('\n')
    .trim();
}

function getSegments(input: StepRecord | StepModelResponse) {
  if ('modelResponse' in input) {
    return input.modelResponse.segments;
  }

  return input.segments;
}
