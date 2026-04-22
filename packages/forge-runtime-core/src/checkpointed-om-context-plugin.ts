import {
  createTextStepContextEntry,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

import type { CheckpointedOmStateStore } from './checkpointed-om.js';

export function createCheckpointedOmContextPlugin(input: {
  threadId: string;
  resourceId: string;
  stateStore: CheckpointedOmStateStore;
}): RuntimePlugin {
  return {
    name: 'forge-checkpointed-om-context',
    async provideContext() {
      const state = await input.stateStore.loadState({
        threadId: input.threadId,
        resourceId: input.resourceId,
      });

      if (!state) {
        return [];
      }

      const entries = [];
      const [checkpointText, reflectionsText, observationsText] = buildCheckpointedOmSystemTexts(state);

      if (checkpointText) {
        entries.push(createTextStepContextEntry({
          id: 'checkpointed-om:checkpoint',
          kind: 'system-instruction',
          title: 'Checkpoint Summary',
          text: checkpointText,
        }));
      }

      if (reflectionsText) {
        entries.push(createTextStepContextEntry({
          id: 'checkpointed-om:reflections',
          kind: 'system-instruction',
          title: 'Active Reflections',
          text: reflectionsText,
        }));
      }

      if (observationsText) {
        entries.push(createTextStepContextEntry({
          id: 'checkpointed-om:observations',
          kind: 'system-instruction',
          title: 'Active Observations',
          text: observationsText,
        }));
      }

      return entries;
    },
  };
}

export async function loadCheckpointedOmSystemTexts(input: {
  threadId: string;
  resourceId: string;
  stateStore: CheckpointedOmStateStore;
}) {
  const state = await input.stateStore.loadState({
    threadId: input.threadId,
    resourceId: input.resourceId,
  });

  if (!state) {
    return [];
  }

  return buildCheckpointedOmSystemTexts(state).filter(Boolean);
}

function buildCheckpointedOmSystemTexts(state: {
  checkpointSummary: { text: string } | null;
  activeReflectionBlocks: Array<{ text: string }>;
  observationBlocks: Array<{ reflectedGeneration: number | null; text: string }>;
}) {
  const checkpointText = renderCheckpointText(state.checkpointSummary?.text ?? null);
  const reflectionsText = renderReflectionsText(state.activeReflectionBlocks.map((block) => block.text));
  const observationsText = renderObservationsText(
    state.observationBlocks
      .filter((block) => block.reflectedGeneration === null)
      .map((block) => block.text),
  );

  return [checkpointText, reflectionsText, observationsText] as const;
}

function renderCheckpointText(text: string | null) {
  const content = text?.trim();

  if (!content) {
    return '';
  }

  return ['Checkpoint summary:', content].join('\n');
}

function renderReflectionsText(reflections: string[]) {
  const content = reflections
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n\n');

  if (!content) {
    return '';
  }

  return ['Active reflections:', content].join('\n');
}

function renderObservationsText(observations: string[]) {
  const content = observations
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n\n');

  if (!content) {
    return '';
  }

  return ['Active observations:', content].join('\n');
}
