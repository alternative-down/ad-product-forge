import { randomUUID } from 'node:crypto';

import type { RuntimeInputTarget } from '../runtime/runtime-input-bridge.js';

import type { ConversationMessage, ConversationStore, ConversationThread } from './contracts.js';
import { createConversationRuntimeInputPayload } from './runtime-input.js';

export type ConversationRuntimeBridgeOptions = {
  runtime: RuntimeInputTarget;
  store: ConversationStore;
  inputType?: string;
};

export class ConversationRuntimeBridge {
  private readonly runtime: RuntimeInputTarget;
  private readonly store: ConversationStore;
  private readonly inputType: string;

  constructor(options: ConversationRuntimeBridgeOptions) {
    this.runtime = options.runtime;
    this.store = options.store;
    this.inputType = options.inputType ?? 'conversation-message';
  }

  async dispatchMessage(input: {
    thread: ConversationThread;
    message: ConversationMessage;
    runtimeInputId?: string;
    receivedAt?: string;
  }) {
    await this.store.upsertThread(input.thread);
    await this.store.appendMessage(input.message);
    await this.runtime.dispatch({
      id: input.runtimeInputId ?? randomUUID(),
      type: this.inputType,
      payload: createConversationRuntimeInputPayload({
        threadId: input.message.threadId,
        messageId: input.message.id,
        role: input.message.role,
        authorId: input.message.authorId,
        parts: input.message.parts,
        metadata: input.message.metadata,
      }),
      receivedAt: input.receivedAt ?? input.message.createdAt,
    });
  }
}
