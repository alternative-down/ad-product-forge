import type { ModelMessage } from 'ai';

type OperationalMemoryOmRenderableState = {
  checkpointSummary: { text?: string | null } | null;
  activeReflectionBlocks: Array<{ text?: string | null }>;
  observationBlocks: Array<{ reflectedGeneration: number | null; text?: string | null }>;
};

export function buildOperationalMemoryOmModelMessages(
  state: OperationalMemoryOmRenderableState,
): ModelMessage[] {
  const blocks = getOperationalMemoryOmBlocks(state);

  return [
    ...blocks.checkpointSummary.map((text) => ({
      role: 'system' as const,
      content: renderCheckpointText(text),
    })),
    ...blocks.reflections.map((text) => ({
      role: 'system' as const,
      content: renderReflectionText(text),
    })),
    ...blocks.observations.map((text) => ({
      role: 'system' as const,
      content: renderObservationText(text),
    })),
  ];
}

export function buildOperationalMemoryOmSystemTexts(state: OperationalMemoryOmRenderableState) {
  const blocks = getOperationalMemoryOmBlocks(state);

  // When checkpointSummary exists, it supersedes activeReflectionBlocks.
  // The summary is the consolidated view; reflections are replaced by it.
  const showReflections = blocks.checkpointSummary.length === 0 && blocks.reflections.length > 0;

  return [
    blocks.checkpointSummary[0] ? renderCheckpointText(blocks.checkpointSummary[0]) : '',
    showReflections
      ? ['<reflections>', blocks.reflections.join('\n\n'), '</reflections>'].join('\n')
      : '',
    blocks.observations.length > 0
      ? ['<observations>', blocks.observations.join('\n\n'), '</observations>'].join('\n')
      : '',
  ] as const;
}

function getOperationalMemoryOmBlocks(state: OperationalMemoryOmRenderableState) {
  return {
    checkpointSummary: normalizeOmTexts([state.checkpointSummary?.text ?? null]),
    reflections: normalizeOmTexts(state.activeReflectionBlocks.map((block) => block.text ?? null)),
    observations: normalizeOmTexts(
      state.observationBlocks
        .filter((block) => block.reflectedGeneration === null)
        .map((block) => block.text ?? null),
    ),
  };
}

function renderCheckpointText(text: string) {
  return ['<resume>', text, '</resume>'].join('\n');
}

function renderReflectionText(text: string) {
  return ['<reflections>', text, '</reflections>'].join('\n');
}

function renderObservationText(text: string) {
  return ['<observations>', text, '</observations>'].join('\n');
}

function normalizeOmTexts(values: Array<string | null | undefined>) {
  return values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean);
}
