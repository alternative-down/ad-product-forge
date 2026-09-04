import { describe, expect, it, vi } from 'vitest';

import type { CommunicationInboundMessage, CommunicationProvider } from './communication.js';
import { createCommunicationModule } from './communication-module.js';

describe('createCommunicationModule', () => {
  it('keeps conversations from available providers when another provider denies access', async () => {
    const unavailableProvider: CommunicationProvider = {
      id: 'discord',
      async listConversations() {
        throw new Error('Missing Access');
      },
      async sendMessage() {
        return { targetKey: 'discord-channel' };
      },
    };
    const availableProvider: CommunicationProvider = {
      id: 'internal-chat',
      async listConversations() {
        return [
          {
            targetKey: 'conversation-1',
            provider: 'internal-chat',
            latestMessageAt: '2026-09-04T20:00:00.000Z',
            unreadCount: 0,
            messages: [],
          },
        ];
      },
      async sendMessage() {
        return { targetKey: 'conversation-1' };
      },
    };
    const module = await createCommunicationModule({
      providers: [unavailableProvider, availableProvider],
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

    await expect(module.listConversations({})).resolves.toEqual([
      expect.objectContaining({ provider: 'internal-chat', targetKey: 'conversation-1' }),
    ]);
    await expect(module.listConversations({ provider: 'discord' })).rejects.toThrow(
      'Missing Access',
    );
  });

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
