import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { getFinanceOverview } from './finance-overview';

function createMockFinance() {
  return {
    getCompanyCashBalance: vi.fn(),
    getCompanyCashSummary: vi.fn(),
    listCompanyCashMovements: vi.fn(),
  };
}

describe('getFinanceOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns balance, summary, and movements on success', async () => {
    const finance = createMockFinance();
    finance.getCompanyCashBalance.mockResolvedValue({ balanceUsd: 1234.56 });
    finance.getCompanyCashSummary.mockResolvedValue({ total: 2000, pending: 500 });
    finance.listCompanyCashMovements.mockResolvedValue([{ id: 'm1', amount: 100 }]);

    const result = await getFinanceOverview(finance as any);

    expect(result.balanceUsd).toBe(1234.56);
    expect(result.summary).toEqual({ total: 2000, pending: 500 });
    expect(result.movements).toHaveLength(1);
  });

  it('calls all three finance methods in parallel', async () => {
    const finance = createMockFinance();
    finance.getCompanyCashBalance.mockResolvedValue({ balanceUsd: 0 });
    finance.getCompanyCashSummary.mockResolvedValue({});
    finance.listCompanyCashMovements.mockResolvedValue([]);

    await getFinanceOverview(finance as any);

    expect(finance.getCompanyCashBalance).toHaveBeenCalledTimes(1);
    expect(finance.getCompanyCashSummary).toHaveBeenCalledTimes(1);
    expect(finance.listCompanyCashMovements).toHaveBeenCalledWith({ limit: 50 });
  });

  it('throws and logs on getCompanyCashBalance failure', async () => {
    const { forgeDebug } = await import('@forge-runtime/core');
    const finance = createMockFinance();
    finance.getCompanyCashBalance.mockRejectedValue(new Error('Balance DB error'));
    finance.getCompanyCashSummary.mockResolvedValue({});
    finance.listCompanyCashMovements.mockResolvedValue([]);

    await expect(getFinanceOverview(finance as any)).rejects.toThrow('Balance DB error');
    expect(forgeDebug).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'admin-read-model',
      level: 'error',
      message: 'getFinanceOverview failed',
    }));
  });

  it('throws and logs on getCompanyCashSummary failure', async () => {
    const { forgeDebug } = await import('@forge-runtime/core');
    const finance = createMockFinance();
    finance.getCompanyCashBalance.mockResolvedValue({ balanceUsd: 0 });
    finance.getCompanyCashSummary.mockRejectedValue(new Error('Summary DB error'));
    finance.listCompanyCashMovements.mockResolvedValue([]);

    await expect(getFinanceOverview(finance as any)).rejects.toThrow('Summary DB error');
  });
});