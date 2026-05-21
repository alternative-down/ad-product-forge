import { describe, expect, it, vi } from 'vitest';
vi.stubGlobal('forgeDebug', vi.fn());
import type { CommunicationInboundMessage, CommunicationProvider } from '@forge-runtime/core';

import type { InternalChatService } from './internal-chat-service';
import { createInternalChatProvider } from './internal-chat-provider';

// ---------------------------------------------------------------------------\n// helpers
// -----------------------------------------------------------------------------

function makeService(overrides: Partial<InternalChatService> = {}): InternalChatService {
  return {
    onReceiveMessage: vi.fn(),
    clearHandler: vi.fn(),
    getAccountByAgentId: vi.fn(),
    listAccounts: vi.fn(),
    listConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    ...overrides,
  } as unknown as InternalChatService;
}

// ---------------------------------------------------------------------------\// createInternalChatProvider
// -----------------------------------------------------------------------------

describe('createInternalChatProvider', () => {
  it('returns a provider with id "internal-chat"', () => {
    const svc = makeService();
    const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });
    expect(provider.id).toBe('internal-chat');
  });

  describe('onMessage', () => {
    it('registers the callback via onReceiveMessage', () => {
      const svc = makeService();
      const cb = vi.fn();
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      provider.onMessage!(cb);

      expect(svc.onReceiveMessage).toHaveBeenCalledWith('agent-1', cb);
    });

    it('updates currentHandler so dispose uses the same callback', () => {
      const svc = makeService();
      const cb = vi.fn();
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      provider.onMessage!(cb);
      provider.dispose!();

      expect(svc.clearHandler).toHaveBeenCalledWith('agent-1', cb);
    });
  });

  describe('dispose', () => {
    it('clears the handler with the stored callback', () => {
      const svc = makeService();
      const cb = vi.fn();
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      provider.onMessage!(cb);
      provider.dispose!();

      expect(svc.clearHandler).toHaveBeenCalledWith('agent-1', cb);
    });

    it('clears with undefined when onMessage was never called', () => {
      const svc = makeService();
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      provider.dispose!();

      expect(svc.clearHandler).toHaveBeenCalledWith('agent-1', undefined);
    });
  });

  describe('getSelfContact', () => {
    it('returns null when no account exists', async () => {
      const svc = makeService({ getAccountByAgentId: vi.fn().mockResolvedValue(null) });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      const result = await provider.getSelfContact!();

      expect(result).toBeNull();
    });

    it('returns contact view when account exists', async () => {
      const account = {
        id: 'acc-1',
        agentId: 'agent-1',
        slug: 'aldric',
        displayName: 'Aldric',
        description: 'Senior developer',
        createdAt: 0,
        updatedAt: 0,
      };
      const svc = makeService({ getAccountByAgentId: vi.fn().mockResolvedValue(account) });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      const result = await provider.getSelfContact!();

      expect(result).toEqual({
        targetKey: 'agent-1',
        slug: 'aldric',
        displayName: 'Aldric',
        description: 'Senior developer',
        metadata: { slug: 'aldric' },
      });
    });

    it('falls back to slug when agentId is absent', async () => {
      const account = {
        id: 'acc-1',
        agentId: null,
        slug: 'system-account',
        displayName: 'System',
        description: null,
        createdAt: 0,
        updatedAt: 0,
      };
      const svc = makeService({ getAccountByAgentId: vi.fn().mockResolvedValue(account) });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      const result = await provider.getSelfContact!();

      expect(result?.targetKey).toBe('system-account');
    });
  });

  describe('listContacts', () => {
    it('excludes the current agent from results', async () => {
      const accounts = [
        {
          id: 'acc-1',
          agentId: 'agent-1',
          slug: 'self',
          displayName: 'Self',
          description: null,
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'acc-2',
          agentId: 'agent-2',
          slug: 'other',
          displayName: 'Other',
          description: null,
          createdAt: 0,
          updatedAt: 0,
        },
      ];
      const svc = makeService({
        listAccounts: vi.fn().mockResolvedValue(accounts),
      });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      await provider.listContacts!();

      expect(svc.listAccounts).toHaveBeenCalledWith({ excludeAgentId: 'agent-1' });
    });

    it('maps returned accounts to contact views', async () => {
      const accounts = [
        {
          id: 'acc-1',
          agentId: 'agent-2',
          slug: 'kael',
          displayName: 'Kaelen',
          description: 'Test',
          createdAt: 0,
          updatedAt: 0,
        },
      ];
      const svc = makeService({ listAccounts: vi.fn().mockResolvedValue(accounts) });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      const result = await provider.listContacts!();

      expect(result).toEqual([
        {
          targetKey: 'agent-2',
          slug: 'kael',
          displayName: 'Kaelen',
          description: 'Test',
          metadata: { slug: 'kael' },
        },
      ]);
    });

    it('returns empty array when no other accounts exist', async () => {
      const svc = makeService({ listAccounts: vi.fn().mockResolvedValue([]) });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      const result = await provider.listContacts!();

      expect(result).toEqual([]);
    });
  });

  describe('listConversations', () => {
    it('forwards agentId, limit, and unread to service', async () => {
      const conversations = [{ key: 'conv-1' }];
      const svc = makeService({
        listConversations: vi.fn().mockResolvedValue(conversations),
      });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      await provider.listConversations!({ limit: 20, unread: true });

      expect(svc.listConversations).toHaveBeenCalledWith({
        agentId: 'agent-1',
        limit: 20,
        unread: true,
      });
    });

    it('returns result from service', async () => {
      const conversations = [{ key: 'conv-1' }, { key: 'conv-2' }];
      const svc = makeService({ listConversations: vi.fn().mockResolvedValue(conversations) });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      const result = await provider.listConversations!({ limit: 10, unread: false });

      expect(result).toBe(conversations);
    });
  });

  describe('getMessages', () => {
    it('forwards all parameters to service', async () => {
      const messages = [{ id: 'msg-1' }];
      const svc = makeService({ getMessages: vi.fn().mockResolvedValue(messages) });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      await provider.getMessages!({
        targetKey: 'conv-1',
        limit: 10,
        offset: 5,
        query: 'hello',
        dateFrom: '1000',
        dateTo: '2000',
      });

      expect(svc.getMessages).toHaveBeenCalledWith({
        agentId: 'agent-1',
        conversationKey: 'conv-1',
        limit: 10,
        offset: 5,
        query: 'hello',
        dateFrom: '1000',
        dateTo: '2000',
      });
    });

    it('returns messages from service', async () => {
      const messages = [{ id: 'msg-1' }, { id: 'msg-2' }];
      const svc = makeService({ getMessages: vi.fn().mockResolvedValue(messages) });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      const result = await provider.getMessages!({ targetKey: 'conv-1', limit: 20, offset: 0 });

      expect(result).toBe(messages);
    });
  });

  describe('sendMessage', () => {
    it('throws when no account found for agent', async () => {
      const svc = makeService({ getAccountByAgentId: vi.fn().mockResolvedValue(null) });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      await expect(
        provider.sendMessage!({ targetKey: 'conv-1', content: 'hello', attachments: [] }),
      ).rejects.toThrow('Internal chat account not found for agent: agent-1');
    });

    it('calls sendMessage with account id and message fields', async () => {
      const account = {
        id: 'acc-1',
        agentId: 'agent-1',
        slug: 'aldric',
        displayName: 'Aldric',
        description: null,
        createdAt: 0,
        updatedAt: 0,
      };
      const sent = { messageId: 'msg-new', conversationKey: 'conv-1' };
      const svc = makeService({
        getAccountByAgentId: vi.fn().mockResolvedValue(account),
        sendMessage: vi.fn().mockResolvedValue(sent),
      });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      const result = await provider.sendMessage({
        targetKey: 'conv-1',
        content: 'hello there',
        attachments: [],
      });

      expect(svc.sendMessage).toHaveBeenCalledWith({
        accountId: 'acc-1',
        targetKey: 'conv-1',
        content: 'hello there',
        attachments: [],
      });
      expect(result).toEqual({ targetKey: 'conv-1', messageId: 'msg-new' });
    });

    it('maps returned conversationKey to targetKey in response', async () => {
      const account = {
        id: 'acc-1',
        agentId: 'agent-1',
        slug: 'aldric',
        displayName: 'Aldric',
        description: null,
        createdAt: 0,
        updatedAt: 0,
      };
      const sent = { messageId: 'msg-x', conversationKey: 'different-conv' };
      const svc = makeService({
        getAccountByAgentId: vi.fn().mockResolvedValue(account),
        sendMessage: vi.fn().mockResolvedValue(sent),
      });
      const provider = createInternalChatProvider({ agentId: 'agent-1', internalChat: svc });

      const result = await provider.sendMessage!({
        targetKey: 'any',
        content: 'hi',
        attachments: [],
      });

      expect(result.targetKey).toBe('different-conv');
      expect(result.messageId).toBe('msg-x');
    });
  });
});
