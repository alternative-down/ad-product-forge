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
const mockMarkNotificationsRead = vi.fn();
vi.mock('./store', () => ({
  createAgentNotificationStore: vi.fn(() => ({
    listNotifications: mockListNotifications,
    markNotificationsRead: mockMarkNotificationsRead,
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

  // ── L#19: list_agent_notifications description (no hidden side effect) ────────────────
  it('L#19: list_agent_notifications description explicitly states it does NOT mark as read', () => {
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['list_agent_notifications']),
    );
    const desc = (tools.list_agent_notifications as { description: string }).description;
    // The NEW description must affirmatively say the tool does NOT mark as read
    expect(desc.toLowerCase()).toMatch(/does\s+not\s+mark\s+them/);
    // And the OLD hidden-side-effect language ("listing them marks") must be absent
    expect(desc).not.toMatch(/listing them marks/i);
  });
});

describe('createAgentNotificationTools (mark_notifications_read, #5623)', () => {
  it('returns mark_notifications_read when permission is granted', () => {
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['mark_notifications_read']),
    );
    expect(Object.keys(tools)).toContain('mark_notifications_read');
  });

  it('does NOT include mark_notifications_read when permission is not granted', () => {
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['list_agent_notifications']),
    );
    expect(Object.keys(tools)).not.toContain('mark_notifications_read');
  });

  it('mark_notifications_read has correct id', () => {
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['mark_notifications_read']),
    );
    expect(tools.mark_notifications_read.id).toBe('mark_notifications_read');
  });

  it('mark_notifications_read tool execute calls store.markNotificationsRead with agentId and notificationIds', async () => {
    mockMarkNotificationsRead.mockResolvedValue({ updatedCount: 2 });
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-abc',
      new Set(['mark_notifications_read']),
    );
    const execute = (
      tools.mark_notifications_read as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute;
    await execute({ notificationIds: ['n1', 'n2'] });
    expect(mockMarkNotificationsRead).toHaveBeenCalledWith({
      agentId: 'agent-abc',
      notificationIds: ['n1', 'n2'],
    });
  });

  it('mark_notifications_read tool execute returns store result on success', async () => {
    mockMarkNotificationsRead.mockResolvedValue({ updatedCount: 3 });
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['mark_notifications_read']),
    );
    const execute = (
      tools.mark_notifications_read as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute;
    const result = await execute({ notificationIds: ['n1', 'n2', 'n3'] });
    expect(result).toEqual({ updatedCount: 3 });
  });

  it('mark_notifications_read tool execute returns valid:false error object on exception', async () => {
    mockMarkNotificationsRead.mockRejectedValue(new Error('DB error'));
    const tools = createAgentNotificationTools(
      {} as any,
      'agent-123',
      new Set(['mark_notifications_read']),
    );
    const execute = (
      tools.mark_notifications_read as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute;
    const result = await execute({ notificationIds: ['n1'] });
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('DB error') });
  });
});
