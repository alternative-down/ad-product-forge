import { describe, expect, it, vi } from 'vitest';

import type { CommunicationInboundMessage, CommunicationProvider } from './communication.js';
import { createCommunicationModule } from './communication-module.js';

describe('createCommunicationModule', () => {
  it('dispatches the same provider message id only once', async () => {
    let inboundHandler: ((message: CommunicationInboundMessage) => Promise<void>) | null = null;
    const provider: CommunicationProvider = {
      id: 'internal-chat',
      onMessage(handler) {
        inboundHandler = handler;
      },
      async sendMessage() {
        return { targetKey: 'conversation-1' };
      },
    };
    const module = await createCommunicationModule({
      providers: [provider],
      workspace: {
        filesystem: {
          async readFile() {
            return '';
          },
          async writeFile() {},
        },
      },
      workspaceRoot: '/workspace',
      contactsStore: {
        async listContacts() {
          return [];
        },
        async saveContacts() {},
      },
    });
    const wakeHandler = vi.fn();
    module.onReceiveMessage(wakeHandler);
    const message: CommunicationInboundMessage = {
      targetKey: 'conversation-1',
      messageId: 'message-1',
      authorId: 'author-1',
      content: 'hello',
      attachments: [],
      createdAt: '2026-09-02T16:00:00.000Z',
    };

    const deliver = inboundHandler;
    if (deliver === null) {
      throw new Error('Provider did not register its inbound handler');
    }
    await deliver(message);
    await deliver(message);

    expect(wakeHandler).toHaveBeenCalledTimes(1);
    expect(wakeHandler).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'internal-chat:message-1' }),
    );
  });
});
