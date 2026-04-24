import type { ModelMessage } from 'ai';

type CheckpointedOmRenderableState = {
  checkpointSummary: { text?: string | null } | null;
  activeReflectionBlocks: Array<{ text?: string | null }>;
  observationBlocks: Array<{ reflectedGeneration: number | null; text?: string | null }>;
};

export function buildCheckpointedOmModelMessages(
  state: CheckpointedOmRenderableState,
): ModelMessage[] {
  const blocks = getCheckpointedOmBlocks(state);

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

export function buildCheckpointedOmSystemTexts(state: CheckpointedOmRenderableState) {
  const blocks = getCheckpointedOmBlocks(state);

  return [
    blocks.checkpointSummary[0] ? renderCheckpointText(blocks.checkpointSummary[0]) : '',
    blocks.reflections.length > 0
      ? ['Active reflections:', blocks.reflections.join('\n\n')].join('\n')
      : '',
    blocks.observations.length > 0
      ? ['Active observations:', blocks.observations.join('\n\n')].join('\n')
      : '',
  ] as const;
}

function getCheckpointedOmBlocks(state: CheckpointedOmRenderableState) {
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
  return ['Checkpoint summary:', text].join('\n');
}

function renderReflectionText(text: string) {
  return ['Active reflection:', text].join('\n');
}

function renderObservationText(text: string) {
  return ['Active observation:', text].join('\n');
}

function normalizeOmTexts(values: Array<string | null | undefined>) {
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}
