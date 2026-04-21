import type {
  StepContextEntry,
  StepContextPart,
} from './types.js';

export function createTextStepContextEntry(input: {
  id: string;
  kind: string;
  title: string;
  text: string;
}): StepContextEntry {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    content: [{
      type: 'text',
      text: input.text,
    }],
  };
}

export function createImageStepContextEntry(input: {
  id: string;
  kind: string;
  title: string;
  mimeType: string;
  bytes: Uint8Array;
  text?: string;
}): StepContextEntry {
  const content: StepContextPart[] = [];

  if (input.text) {
    content.push({
      type: 'text',
      text: input.text,
    });
  }

  content.push({
    type: 'image',
    mimeType: input.mimeType,
    bytes: input.bytes,
  });

  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    content,
  };
}

export function getStepContextParts(entry: StepContextEntry): StepContextPart[] {
  if (entry.content && entry.content.length > 0) {
    return entry.content;
  }

  if (entry.text) {
    return [{
      type: 'text',
      text: entry.text,
    }];
  }

  return [];
}

export function getStepContextText(entry: StepContextEntry) {
  return getStepContextParts(entry)
    .filter((part) => part.type === 'text')
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0)
    .join('\n')
    .trim();
}
