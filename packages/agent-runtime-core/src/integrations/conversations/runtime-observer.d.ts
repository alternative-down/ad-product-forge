import type { RuntimeObserver } from '../../core/observers.js';
import type { ConversationStore } from './contracts.js';
export type ConversationRuntimeObserverOptions = {
    store: ConversationStore;
    authorId?: string;
    name?: string;
};
export declare function createConversationRuntimeObserver(options: ConversationRuntimeObserverOptions): RuntimeObserver;
