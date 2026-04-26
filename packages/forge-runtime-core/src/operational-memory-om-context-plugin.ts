import {
  createTextStepContextEntry,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

import { buildCheckpointedOmSystemTexts } from './operational-memory-om-rendering.js';
import type { CheckpointedOmStateStore } from './operational-memory-om.js';

export function createCheckpointedOmContextPlugin(input: {
  threadId: string;
  resourceId: string;
  stateStore: CheckpointedOmStateStore;
}): RuntimePlugin {
  return {
    name: 'forge-operational-memory-om-context',
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
          id: 'operational-memory-om:checkpoint',
          kind: 'system-instruction',
          title: 'Checkpoint Summary',
          text: checkpointText,
        }));
      }

      if (reflectionsText) {
        entries.push(createTextStepContextEntry({
          id: 'operational-memory-om:reflections',
          kind: 'system-instruction',
          title: 'Active Reflections',
          text: reflectionsText,
        }));
      }

      if (observationsText) {
        entries.push(createTextStepContextEntry({
          id: 'operational-memory-om:observations',
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
