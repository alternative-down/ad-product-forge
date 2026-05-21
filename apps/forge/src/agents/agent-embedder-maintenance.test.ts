import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
}));

vi.mock('../database/schema', () => ({
  agents: {},
}));

import {
  DEFAULT_WORKSPACE_EMBEDDER,
  prepareAgentEmbeddersForStartup,
} from './agent-embedder-maintenance';

describe('DEFAULT_WORKSPACE_EMBEDDER', () => {
  it('is transformers-multilingual-e5-small-cpu', () => {
    expect(DEFAULT_WORKSPACE_EMBEDDER).toBe('transformers-multilingual-e5-small-cpu');
  });
});

describe('prepareAgentEmbeddersForStartup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips non-fastembed agents (no update needed)', async () => {
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    const mockDb = {
      query: {
        agents: {
          findMany: vi.fn().mockResolvedValueOnce([
            { id: 'a1', workspaceEmbedder: DEFAULT_WORKSPACE_EMBEDDER },
            { id: 'a2', workspaceEmbedder: null },
          ]),
        },
      },
      update: updateMock,
    };

    await prepareAgentEmbeddersForStartup({ db: mockDb as any, workspaceBasePath: '/base' });

    expect(mockDb.query.agents.findMany).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates fastembed agents to default embedder', async () => {
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    const mockDb = {
      query: {
        agents: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ id: 'fast-agent-1', workspaceEmbedder: 'fastembed' }]),
        },
      },
      update: updateMock,
    };

    await prepareAgentEmbeddersForStartup({ db: mockDb as any, workspaceBasePath: '/base' });

    expect(updateMock).toHaveBeenCalled();
  });

  it('handles empty agent list', async () => {
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    const mockDb = {
      query: {
        agents: {
          findMany: vi.fn().mockResolvedValueOnce([]),
        },
      },
      update: updateMock,
    };

    await prepareAgentEmbeddersForStartup({ db: mockDb as any, workspaceBasePath: '/base' });

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('filters multiple agents, only fastembed ones get updated', async () => {
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    const mockDb = {
      query: {
        agents: {
          findMany: vi.fn().mockResolvedValueOnce([
            { id: 'agent-1', workspaceEmbedder: DEFAULT_WORKSPACE_EMBEDDER },
            { id: 'agent-2', workspaceEmbedder: 'fastembed' },
            { id: 'agent-3', workspaceEmbedder: null },
            { id: 'agent-4', workspaceEmbedder: 'fastembed' },
          ]),
        },
      },
      update: updateMock,
    };

    await prepareAgentEmbeddersForStartup({ db: mockDb as any, workspaceBasePath: '/base' });

    expect(updateMock).toHaveBeenCalledTimes(2);
  });
});
