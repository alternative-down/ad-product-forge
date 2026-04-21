import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput } from '../../core/types.js';
import type { ConversationStore } from './contracts.js';
export type ConversationHistoryPluginOptions = {
    store: ConversationStore;
    maxMessages?: number;
    name?: string;
    selectThreadId?(pendingInputs: RuntimeInput[]): string | null;
};
export declare function createConversationHistoryPlugin(options: ConversationHistoryPluginOptions): RuntimePlugin;
