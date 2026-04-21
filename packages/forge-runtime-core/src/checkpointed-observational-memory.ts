import {
  createCheckpointedConversationPlugin,
  type CheckpointedConversationMemory,
  type CheckpointedConversationMetrics,
  type CheckpointedConversationObservation,
  type CheckpointedConversationState,
  type CheckpointedConversationStateStore,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

export type CheckpointedOmArchivedObservation = CheckpointedConversationObservation;
export type CheckpointedOmArchivedReflection = never;
export type CheckpointedOmMetricsSnapshot = CheckpointedConversationMetrics;
export type CheckpointedOmState = CheckpointedConversationState;
export type CheckpointedOmStateStore = CheckpointedConversationStateStore;

export type CheckpointedOmCheckpointPackageInput = {
  checkpointMessageId: string | null;
  overflowMessageIds: string[];
  updatedAt: string;
};

export function createCheckpointedObservationalMemoryProcessor(input: {
  memory: CheckpointedConversationMemory;
  consolidateAfterStep?: boolean;
}): RuntimePlugin {
  return createCheckpointedConversationPlugin({
    memory: input.memory,
    consolidateAfterStep: input.consolidateAfterStep,
  });
}
