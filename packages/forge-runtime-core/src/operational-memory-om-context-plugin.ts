import {
  createTextStepContextEntry,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

import { buildOperationalMemoryOmSystemTexts } from './operational-memory-om-rendering.js';
import type { OperationalMemoryOmStateStore } from './operational-memory-om.js';

export function createOperationalMemoryOmContextPlugin(input: {
  threadId: string;
  resourceId: string;
  stateStore: OperationalMemoryOmStateStore;
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
      const [checkpointText, reflectionsText, observationsText] = buildOperationalMemoryOmSystemTexts(state);

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

export async function loadOperationalMemoryOmSystemTexts(input: {
  threadId: string;
  resourceId: string;
  stateStore: OperationalMemoryOmStateStore;
}) {
  const state = await input.stateStore.loadState({
    threadId: input.threadId,
    resourceId: input.resourceId,
  });

  if (!state) {
    return [];
  }

  return buildOperationalMemoryOmSystemTexts(state).filter(Boolean);
}
