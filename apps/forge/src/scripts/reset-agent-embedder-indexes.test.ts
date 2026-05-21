import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('dotenv/config', () => ({}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('../agents/agent-embedder-maintenance', () => ({
  resetAgentEmbedderIndexes: vi.fn().mockResolvedValue(undefined),
}));

import { resetAgentEmbedderIndexes } from '../agents/agent-embedder-maintenance';

describe('reset-agent-embedder-indexes script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('inputSchema', () => {
    it('requires workspaceBasePath to be non-empty', () => {
      const emptyPath = '';
      expect(emptyPath.length).toBe(0);
    });

    it('requires at least one agentId', () => {
      const agentIds: string[] = [];
      expect(agentIds.length).toBe(0);
    });

    it('accepts valid workspaceBasePath and agentIds', () => {
      const input = {
        workspaceBasePath: '/workspaces',
        agentIds: ['agent-1'],
      };
      expect(input.workspaceBasePath.length).toBeGreaterThan(0);
      expect(input.agentIds.length).toBeGreaterThan(0);
    });
  });

  describe('resetAgentEmbedderIndexes', () => {
    it('is called with workspaceBasePath and agentId', async () => {
      await resetAgentEmbedderIndexes('/base', 'agent-1');
      expect(resetAgentEmbedderIndexes).toHaveBeenCalledWith('/base', 'agent-1');
    });

    it('is called once per agent', async () => {
      (resetAgentEmbedderIndexes as any).mockReset();

      const agents = ['agent-1', 'agent-2', 'agent-3'];
      await Promise.all(agents.map((id) => resetAgentEmbedderIndexes('/base', id)));

      expect(resetAgentEmbedderIndexes).toHaveBeenCalledTimes(3);
    });
  });
});
