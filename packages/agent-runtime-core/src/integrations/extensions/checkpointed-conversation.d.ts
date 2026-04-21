import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput } from '../../core/types.js';
import type { CheckpointedConversationMemory } from '../memory/checkpointed-conversation-memory.js';
export type CheckpointedConversationPluginOptions = {
    memory: CheckpointedConversationMemory;
    consolidateAfterStep?: boolean;
    selectThreadId?(pendingInputs: RuntimeInput[]): string | null;
};
export declare function createCheckpointedConversationPlugin(options: CheckpointedConversationPluginOptions): RuntimePlugin;
