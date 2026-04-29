import { describe, expect, it, vi, beforeEach } from 'vitest';
import { reloadAgentMcp, reloadLinkedAgentsForMcpServer } from './mcp-helpers';
import { reloadAgentIfLoaded } from '../../capabilities/runtime';

vi.mock('../../capabilities/runtime', () => ({
  reloadAgentIfLoaded: vi.fn(),
}));

describe('reloadAgentMcp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls reloadAgentIfLoaded with correct args', async () => {
    const db = {} as never;
    const loaderConfig = { agentId: 'agent-xyz' } as never;
    const agentId = 'agent-xyz';

    await reloadAgentMcp(db, loaderConfig, agentId);

    expect(reloadAgentIfLoaded).toHaveBeenCalledOnce();
    expect(reloadAgentIfLoaded).toHaveBeenCalledWith(db, loaderConfig, agentId);
  });
});

describe('reloadLinkedAgentsForMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when no linked agents found', async () => {
    const db = {
      query: {
        agentMcpConfigs: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    } as never;
    const loaderConfig = {} as never;
    const serverId = 'server-none';

    await reloadLinkedAgentsForMcpServer(db, loaderConfig, serverId);

    expect(reloadAgentIfLoaded).not.toHaveBeenCalled();
  });

  it('calls reloadAgentIfLoaded for each linked agent', async () => {
    const db = {
      query: {
        agentMcpConfigs: {
          findMany: vi.fn().mockResolvedValue([
            { agentId: 'agent-a' },
            { agentId: 'agent-b' },
            { agentId: 'agent-c' },
          ]),
        },
      },
    } as never;
    const loaderConfig = {} as never;
    const serverId = 'server-multi';

    await reloadLinkedAgentsForMcpServer(db, loaderConfig, serverId);

    expect(reloadAgentIfLoaded).toHaveBeenCalledTimes(3);
    expect(reloadAgentIfLoaded).toHaveBeenNthCalledWith(1, db, loaderConfig, 'agent-a');
    expect(reloadAgentIfLoaded).toHaveBeenNthCalledWith(2, db, loaderConfig, 'agent-b');
    expect(reloadAgentIfLoaded).toHaveBeenNthCalledWith(3, db, loaderConfig, 'agent-c');
  });

  it('calls reloadAgentIfLoaded for single linked agent', async () => {
    const db = {
      query: {
        agentMcpConfigs: {
          findMany: vi.fn().mockResolvedValue([{ agentId: 'agent-single' }]),
        },
      },
    } as never;
    const loaderConfig = { configKey: 'val' } as never;
    const serverId = 'server-single';

    await reloadLinkedAgentsForMcpServer(db, loaderConfig, serverId);

    expect(reloadAgentIfLoaded).toHaveBeenCalledTimes(1);
    expect(reloadAgentIfLoaded).toHaveBeenCalledWith(db, loaderConfig, 'agent-single');
  });
});
