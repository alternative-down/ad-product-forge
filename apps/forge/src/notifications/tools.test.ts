import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAgentNotificationTools } from './tools';

vi.mock('@forge-runtime/core', () => ({
  createTool: vi.fn(
    (config: { id: string; description: string; inputSchema: unknown; execute: unknown }) => ({
      ...config,
      _isTool: true,
    }),
  ),
  forgeDebug: vi.fn(),
}));

// Mock the notifications store
const mockListNotifications = vi.fn();
vi.mock('./store', () => ({
  createAgentNotificationStore: vi.fn(() => ({
    listNotifications: mockListNotifications,
    createNotification: vi.fn(),
    getNotification: vi.fn(),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createAgentNotificationTools', () => {
  it('returns list_agent_notifications when permission is granted', () => {
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['list_agent_notifications']),
    );
    expect(Object.keys(tools)).toContain('list_agent_notifications');
  });

  it('does NOT include tool when no permission', () => {
    const tools = createAgentNotificationTools({} as any, 'agent-123', new Set(['other_tool']));
    expect(Object.keys(tools)).not.toContain('list_agent_notifications');
  });

  it('includes tool when allowedToolIds is null', () => {
    const tools = createAgentNotificationTools({} as any, 'agent-123', null);
    expect(Object.keys(tools)).toContain('list_agent_notifications');
  });

  it('does NOT include tool when allowedToolIds is empty set', () => {
    const tools = createAgentNotificationTools({} as any, 'agent-123', new Set());
    expect(Object.keys(tools)).not.toContain('list_agent_notifications');
  });

  it('tool has correct id', () => {
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['list_agent_notifications']),
    );
    expect(tools.list_agent_notifications.id).toBe('list_agent_notifications');
  });

  it('tool execute calls store.listNotifications with agentId', async () => {
    mockListNotifications.mockResolvedValue([]);
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-abc',
      new Set(['list_agent_notifications']),
    );
    const execute = (
      tools.list_agent_notifications as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute;
    await execute({});
    expect(mockListNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-abc', unreadOnly: false, limit: 20 }),
    );
  });

  it('tool execute respects unreadOnly from input', async () => {
    mockListNotifications.mockResolvedValue([]);
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['list_agent_notifications']),
    );
    const execute = (
      tools.list_agent_notifications as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute;
    await execute({ unreadOnly: true });
    expect(mockListNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ unreadOnly: true }),
    );
  });

  it('tool execute respects limit from input', async () => {
    mockListNotifications.mockResolvedValue([]);
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['list_agent_notifications']),
    );
    const execute = (
      tools.list_agent_notifications as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute;
    await execute({ limit: 50 });
    expect(mockListNotifications).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it('tool execute returns store result on success', async () => {
    const notifications = [
      { notificationId: 'n1', content: 'test', timestamp: 1234567890, read: false },
    ];
    mockListNotifications.mockResolvedValue(notifications);
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['list_agent_notifications']),
    );
    const execute = (
      tools.list_agent_notifications as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute;
    const result = await execute({});
    expect(result).toEqual(notifications);
  });

  it('tool execute returns valid:false error object on exception', async () => {
    mockListNotifications.mockRejectedValue(new Error('DB error'));
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['list_agent_notifications']),
    );
    const execute = (
      tools.list_agent_notifications as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute;
    const result = await execute({});
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('DB error') });
  });
});
