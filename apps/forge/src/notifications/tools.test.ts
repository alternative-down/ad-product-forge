import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAgentNotificationTools } from './tools';

const mocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
}));

vi.mock('./store', () => ({
  createAgentNotificationStore: vi.fn(() => ({
    listNotifications: mocks.listNotifications,
  })),
}));

vi.mock('../capabilities/catalog', () => ({
  hasToolPermission: vi.fn(),
}));

describe('createAgentNotificationTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty object when allowedToolIds is null', () => {
    const tools = createAgentNotificationTools({} as any, 'agent-1', null);
    expect(tools).toEqual({});
  });

  it('returns empty object when allowedToolIds does not include list_agent_notifications', async () => {
    const { hasToolPermission } = await import('../capabilities/catalog');
    (hasToolPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const tools = createAgentNotificationTools({} as any, 'agent-1', new Set<string>());
    expect(tools).toEqual({});
  });

  it('registers list_agent_notifications tool when permitted', async () => {
    const { hasToolPermission } = await import('../capabilities/catalog');
    (hasToolPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const tools = createAgentNotificationTools({} as any, 'agent-1', new Set(['list_agent_notifications']));
    expect(tools).toHaveProperty('list_agent_notifications');
    expect(typeof tools.list_agent_notifications).toBe('object');
    expect((tools.list_agent_notifications as any).id).toBe('list_agent_notifications');
  });

  it('execute calls listNotifications with correct params', async () => {
    const { hasToolPermission } = await import('../capabilities/catalog');
    (hasToolPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mocks.listNotifications.mockResolvedValue({ items: [], total: 0 });
    const tools = createAgentNotificationTools({} as any, 'agent-abc', new Set(['list_agent_notifications']));
    const tool = tools.list_agent_notifications as any;
    const result = await tool.execute({ unreadOnly: true, limit: 5 });
    expect(mocks.listNotifications).toHaveBeenCalledWith({
      agentId: 'agent-abc',
      unreadOnly: true,
      limit: 5,
    });
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('execute returns error result on exception', async () => {
    const { hasToolPermission } = await import('../capabilities/catalog');
    (hasToolPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mocks.listNotifications.mockRejectedValue(new Error('DB unavailable'));
    const tools = createAgentNotificationTools({} as any, 'agent-1', new Set(['list_agent_notifications']));
    const tool = tools.list_agent_notifications as any;
    const result = await tool.execute({});
    expect(result).toEqual({
      valid: false,
      error: 'DB unavailable',
      hint: 'Try again in a moment. If the problem persists, verify the notification store is available.',
    });
  });

  it('execute uses default values when input missing', async () => {
    const { hasToolPermission } = await import('../capabilities/catalog');
    (hasToolPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mocks.listNotifications.mockResolvedValue({ items: [] });
    const tools = createAgentNotificationTools({} as any, 'agent-1', new Set(['list_agent_notifications']));
    const tool = tools.list_agent_notifications as any;
    await tool.execute({});
    expect(mocks.listNotifications).toHaveBeenCalledWith({
      agentId: 'agent-1',
      unreadOnly: false,
      limit: 20,
    });
  });
});
