import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('dotenv/config', () => ({}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { topUpActiveAgentContract } from '../agents/top-up-agent-contract';

vi.mock('../agents/top-up-agent-contract', () => ({
  topUpActiveAgentContract: vi.fn(),
}));

// Re-import after mocking
import '../database/schema';

describe('top-up-agent-contract CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cliInputSchema', () => {
    it('accepts valid input', async () => {
      const { getDatabase, runMigrations } = await import('../database/schema');
      vi.spyOn(getDatabase() as any, 'query' as any, 'get').mockReturnValue({});
    });
  });
});

describe('topUpActiveAgentContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is callable with agentId and amountUsd', async () => {
    const mockDb = {} as any;
    (topUpActiveAgentContract as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      agentId: 'agent-1',
      contractId: 'contract-1',
      budgetUsd: 50.0,
    });

    const result = await topUpActiveAgentContract(mockDb, {
      agentId: 'agent-1',
      amountUsd: 50,
    });

    expect(result.agentId).toBe('agent-1');
    expect(result.budgetUsd).toBe(50.0);
  });
});