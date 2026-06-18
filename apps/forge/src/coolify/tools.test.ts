import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createCoolifyTools } from './tools';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  createTool: vi.fn(
    (config: { id: string; description: string; inputSchema: unknown; execute: unknown }) => ({
      ...config,
      _isTool: true,
    }),
  ),
}));

const mockCoolifyManager = {
  listApplications: vi.fn(),
  startApplication: vi.fn(),
  stopApplication: vi.fn(),
  getApplicationLogs: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

const TOOL_IDS = [
  'list_coolify_applications',
  'start_coolify_application',
  'stop_coolify_application',
  'get_coolify_application_logs',
] as const;

describe('createCoolifyTools', () => {
  describe('tool availability', () => {
    for (const toolId of TOOL_IDS) {
      it(`includes ${toolId} when permission is granted`, () => {
        const tools = createCoolifyTools(
          mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
          new Set([toolId]),
        );
        expect(Object.keys(tools)).toContain(toolId);
      });

      it(`does NOT include ${toolId} when no permission`, () => {
        const tools = createCoolifyTools(
          mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
          new Set(['other_tool']),
        );
        expect(Object.keys(tools)).not.toContain(toolId);
      });

      it(`includes ${toolId} when allowedToolIds is null (unrestricted)`, () => {
        const tools = createCoolifyTools(
          mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
          null,
        );
        expect(Object.keys(tools)).toContain(toolId);
      });

      it(`includes ${toolId} when allowedToolIds is undefined`, () => {
        const tools = createCoolifyTools(
          mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
          undefined,
        );
        expect(Object.keys(tools)).toContain(toolId);
      });

      it(`does NOT include ${toolId} when allowedToolIds is empty set`, () => {
        const tools = createCoolifyTools(
          mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
          new Set(),
        );
        expect(Object.keys(tools)).not.toContain(toolId);
      });
    }
  });

  describe('list_coolify_applications', () => {
    it('calls coolify.listApplications()', async () => {
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['list_coolify_applications']),
      );
      const execute = (
        tools.list_coolify_applications as unknown as { execute: () => Promise<unknown> }
      ).execute;
      await execute();
      expect(mockCoolifyManager.listApplications).toHaveBeenCalledOnce();
    });

    it('returns success with applications on success', async () => {
      const applications = [{ uuid: 'app-1', name: 'Test App' }];
      mockCoolifyManager.listApplications.mockResolvedValue(applications);
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['list_coolify_applications']),
      );
      const execute = (
        tools.list_coolify_applications as unknown as { execute: () => Promise<unknown> }
      ).execute;
      const result = await execute();
      expect(result).toEqual({ valid: true, data: { success: true, applications } });
    });

    it('returns success:false on error', async () => {
      mockCoolifyManager.listApplications.mockRejectedValue(new Error('Coolify unavailable'));
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['list_coolify_applications']),
      );
      const execute = (
        tools.list_coolify_applications as unknown as { execute: () => Promise<unknown> }
      ).execute;
      const result = await execute();
      expect(result).toMatchObject({ valid: false, error: 'Coolify unavailable', hint: expect.any(String) });
    });
  });

  describe('start_coolify_application', () => {
    it('calls coolify.startApplication() with correct UUID', async () => {
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['start_coolify_application']),
      );
      const execute = (
        tools.start_coolify_application as unknown as {
          execute: (input: unknown) => Promise<unknown>;
        }
      ).execute;
      await execute({ applicationUuid: 'app-abc' });
      expect(mockCoolifyManager.startApplication).toHaveBeenCalledWith('app-abc');
    });

    it('returns success:true with UUID on success', async () => {
      mockCoolifyManager.startApplication.mockResolvedValue(undefined);
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['start_coolify_application']),
      );
      const execute = (
        tools.start_coolify_application as unknown as {
          execute: (input: unknown) => Promise<unknown>;
        }
      ).execute;
      const result = await execute({ applicationUuid: 'app-xyz' });
      expect(result).toEqual({ valid: true, data: { success: true, applicationUuid: 'app-xyz' } });
    });

    it('returns success:false with error on exception', async () => {
      mockCoolifyManager.startApplication.mockRejectedValue(new Error('Start failed'));
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['start_coolify_application']),
      );
      const execute = (
        tools.start_coolify_application as unknown as {
          execute: (input: unknown) => Promise<unknown>;
        }
      ).execute;
      const result = await execute({ applicationUuid: 'app-err' });
      expect(result).toMatchObject({
        valid: false,
        error: 'Start failed',
        hint: expect.any(String),
      });
    });
  });

  describe('stop_coolify_application', () => {
    it('calls coolify.stopApplication() with correct UUID', async () => {
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['stop_coolify_application']),
      );
      const execute = (
        tools.stop_coolify_application as unknown as {
          execute: (input: unknown) => Promise<unknown>;
        }
      ).execute;
      await execute({ applicationUuid: 'app-stop' });
      expect(mockCoolifyManager.stopApplication).toHaveBeenCalledWith('app-stop');
    });

    it('returns success:true with UUID on success', async () => {
      mockCoolifyManager.stopApplication.mockResolvedValue(undefined);
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['stop_coolify_application']),
      );
      const execute = (
        tools.stop_coolify_application as unknown as {
          execute: (input: unknown) => Promise<unknown>;
        }
      ).execute;
      const result = await execute({ applicationUuid: 'app-stopped' });
      expect(result).toEqual({ valid: true, data: { success: true, applicationUuid: 'app-stopped' } });
    });

    it('returns success:false with error on exception', async () => {
      mockCoolifyManager.stopApplication.mockRejectedValue(new Error('Stop failed'));
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['stop_coolify_application']),
      );
      const execute = (
        tools.stop_coolify_application as unknown as {
          execute: (input: unknown) => Promise<unknown>;
        }
      ).execute;
      const result = await execute({ applicationUuid: 'app-err' });
      expect(result).toMatchObject({
        valid: false,
        error: 'Stop failed',
        hint: expect.any(String),
      });
    });
  });

  describe('get_coolify_application_logs', () => {
    it('calls coolify.getApplicationLogs() with applicationUuid and lines', async () => {
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['get_coolify_application_logs']),
      );
      const execute = (
        tools.get_coolify_application_logs as unknown as {
          execute: (input: unknown) => Promise<unknown>;
        }
      ).execute;
      await execute({ applicationUuid: 'app-logs', lines: 50 });
      expect(mockCoolifyManager.getApplicationLogs).toHaveBeenCalledWith({
        applicationUuid: 'app-logs',
        lines: 50,
      });
    });

    it('returns success:false with error on exception', async () => {
      mockCoolifyManager.getApplicationLogs.mockRejectedValue(new Error('Logs unavailable'));
      const tools = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(['get_coolify_application_logs']),
      );
      const execute = (
        tools.get_coolify_application_logs as unknown as {
          execute: (input: unknown) => Promise<unknown>;
        }
      ).execute;
      const result = await execute({ applicationUuid: 'app-logs' });
      expect(result).toMatchObject({
        valid: false,
        error: 'Logs unavailable',
        hint: expect.any(String),
      });
    });
  });

  describe('no raw credentials exposure', () => {
    it('does NOT include get_coolify_credentials in any tool set', () => {
      // Unrestricted
      const toolsUnrestricted = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        null,
      );
      expect(Object.keys(toolsUnrestricted)).not.toContain('get_coolify_credentials');

      // With new permissions
      const toolsScoped = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(TOOL_IDS),
      );
      expect(Object.keys(toolsScoped)).not.toContain('get_coolify_credentials');

      // Empty set
      const toolsEmpty = createCoolifyTools(
        mockCoolifyManager as unknown as Parameters<typeof createCoolifyTools>[0],
        new Set(),
      );
      expect(Object.keys(toolsEmpty)).not.toContain('get_coolify_credentials');
    });
  });
});
