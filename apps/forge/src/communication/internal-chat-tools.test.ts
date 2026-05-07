import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createInternalChatTools } from './internal-chat-tools';

function makeMockService(overrides?: Partial<{ changeChatGroup: ReturnType<typeof vi.fn> }>) {
  return {
    changeChatGroup: overrides?.changeChatGroup ?? vi.fn(),
  };
}

describe('createInternalChatTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('change_chat_group tool', () => {
    it('registers change_chat_group tool when no allowedToolIds restriction', () => {
      const tools = createInternalChatTools('agent-1', 'Agent One', makeMockService() as any, null);
      expect(tools).toHaveProperty('change_chat_group');
      expect(typeof tools.change_chat_group).toBe('object');
    });

    it('registers change_chat_group tool when in allowedToolIds', () => {
      const tools = createInternalChatTools('agent-1', 'Agent One', makeMockService() as any, new Set(['change_chat_group']));
      expect(tools).toHaveProperty('change_chat_group');
    });

    it('omits change_chat_group when not in allowedToolIds', () => {
      const tools = createInternalChatTools('agent-1', 'Agent One', makeMockService() as any, new Set(['other_tool']));
      expect(tools).not.toHaveProperty('change_chat_group');
    });

    describe('execute: action=create', () => {
      it('returns error when create missing', async () => {
        const tools = createInternalChatTools('agent-1', 'Agent One', makeMockService() as any, null);
        const result = await (tools.change_chat_group as any).execute({ action: 'create' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('create is required');
      });

      it('returns error when create.name missing', async () => {
        const tools = createInternalChatTools('agent-1', 'Agent One', makeMockService() as any, null);
        const result = await (tools.change_chat_group as any).execute({ action: 'create', create: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('create.name is required');
      });

      it('calls changeChatGroup with correct args for create', async () => {
        const mockChangeChatGroup = vi.fn().mockResolvedValue({ groupId: 'new-group-123' });
        const mockService = makeMockService({ changeChatGroup: mockChangeChatGroup }) as any;
        const tools = createInternalChatTools('agent-abc', 'Agent', mockService, null);
        const result = await (tools.change_chat_group as any).execute({
          action: 'create',
          create: {
            name: 'My Team',
            members: [{ participantKey: 'contact-1', role: 'normal' }],
          },
        });
        expect(mockChangeChatGroup).toHaveBeenCalledWith({
          agentId: 'agent-abc',
          name: 'My Team',
          members: [{ participantKey: 'contact-1', role: 'normal' }],
        });
        expect(result.valid).toBe(true);
        expect(result.groupId).toBe('new-group-123');
      });

      it('passes members as undefined when create has no members', async () => {
        const mockChangeChatGroup = vi.fn().mockResolvedValue({ groupId: 'g-1' });
        const mockService = makeMockService({ changeChatGroup: mockChangeChatGroup }) as any;
        const tools = createInternalChatTools('agent-1', 'Agent', mockService, null);
        await (tools.change_chat_group as any).execute({
          action: 'create',
          create: { name: 'New Group' },
        });
        expect(mockChangeChatGroup).toHaveBeenCalledWith({
          agentId: 'agent-1',
          name: 'New Group',
          members: undefined,
        });
      });
    });

    describe('execute: action=update', () => {
      it('returns error when update missing', async () => {
        const tools = createInternalChatTools('agent-1', 'Agent One', makeMockService() as any, null);
        const result = await (tools.change_chat_group as any).execute({ action: 'update' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('update is required');
      });

      it('returns error when update.groupId missing', async () => {
        const tools = createInternalChatTools('agent-1', 'Agent One', makeMockService() as any, null);
        const result = await (tools.change_chat_group as any).execute({ action: 'update', update: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('update.groupId is required');
      });

      it('calls changeChatGroup with correct args for update', async () => {
        const mockChangeChatGroup = vi.fn().mockResolvedValue({ groupId: 'updated-group' });
        const mockService = makeMockService({ changeChatGroup: mockChangeChatGroup }) as any;
        const tools = createInternalChatTools('agent-x', 'Agent', mockService, null);
        const result = await (tools.change_chat_group as any).execute({
          action: 'update',
          update: {
            groupId: 'group-456',
            name: 'Renamed Team',
            members: [{ participantKey: 'contact-2', role: 'admin' }],
          },
        });
        expect(mockChangeChatGroup).toHaveBeenCalledWith({
          agentId: 'agent-x',
          groupId: 'group-456',
          name: 'Renamed Team',
          members: [{ participantKey: 'contact-2', role: 'admin' }],
        });
        expect(result.valid).toBe(true);
      });

      it('passes name and members as undefined when not provided in update', async () => {
        const mockChangeChatGroup = vi.fn().mockResolvedValue({ groupId: 'g-xyz' });
        const mockService = makeMockService({ changeChatGroup: mockChangeChatGroup }) as any;
        const tools = createInternalChatTools('agent-1', 'Agent', mockService, null);
        await (tools.change_chat_group as any).execute({
          action: 'update',
          update: { groupId: 'group-789' },
        });
        expect(mockChangeChatGroup).toHaveBeenCalledWith({
          agentId: 'agent-1',
          groupId: 'group-789',
          name: undefined,
          members: undefined,
        });
      });
    });

    describe('execute: error handling', () => {
      it('returns valid=false with error message on exception', async () => {
        const mockChangeChatGroup = vi.fn().mockRejectedValue(new Error('Service unavailable'));
        const mockService = makeMockService({ changeChatGroup: mockChangeChatGroup }) as any;
        const tools = createInternalChatTools('agent-1', 'Agent', mockService, null);
        const result = await (tools.change_chat_group as any).execute({
          action: 'create',
          create: { name: 'Test Group' },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Service unavailable');
      });

      it('returns valid=false when error is not an Error instance', async () => {
        const mockChangeChatGroup = vi.fn().mockRejectedValue('string error');
        const mockService = makeMockService({ changeChatGroup: mockChangeChatGroup }) as any;
        const tools = createInternalChatTools('agent-1', 'Agent', mockService, null);
        const result = await (tools.change_chat_group as any).execute({
          action: 'create',
          create: { name: 'Test Group' },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('string error');
      });
    });
  });

  // ─── hasToolPermission edge cases ─────────────────────────────────────────

  describe('hasToolPermission edge cases', () => {
    it('omits change_chat_group when allowedToolIds is an empty Set', () => {
      const tools = createInternalChatTools(
        'agent-1',
        'Agent One',
        makeMockService() as any,
        new Set<string>(),
      );
      expect(tools).not.toHaveProperty('change_chat_group');
    });

    it('omits change_chat_group when allowedToolIds is a Set without the tool', () => {
      const tools = createInternalChatTools(
        'agent-1',
        'Agent One',
        makeMockService() as any,
        new Set(['list_contacts', 'read_messages']),
      );
      expect(tools).not.toHaveProperty('change_chat_group');
    });

    it('registers change_chat_group when allowedToolIds is undefined', () => {
      const tools = createInternalChatTools(
        'agent-1',
        'Agent One',
        makeMockService() as any,
        undefined,
      );
      expect(tools).toHaveProperty('change_chat_group');
    });
  });
});