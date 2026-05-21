import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { getRecurringPayables } from './payables-overview';

describe('getRecurringPayables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns listRecurringPayables result on success', async () => {
    const payables = {
      listRecurringPayables: vi.fn().mockResolvedValue([
        { id: 'pay-1', amount: 100, frequency: 'monthly' },
        { id: 'pay-2', amount: 200, frequency: 'weekly' },
      ]),
    };

    const result = await getRecurringPayables(payables as any);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('pay-1');
  });

  it('calls listRecurringPayables with no arguments', async () => {
    const listSpy = vi.fn().mockResolvedValue([]);
    const payables = { listRecurringPayables: listSpy };

    await getRecurringPayables(payables as any);

    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(listSpy).toHaveBeenCalledWith();
  });

  it('throws and logs on failure', async () => {
    const { forgeDebug } = await import('@forge-runtime/core');
    const payables = {
      listRecurringPayables: vi.fn().mockRejectedValue(new Error('DB read error')),
    };

    await expect(getRecurringPayables(payables as any)).rejects.toThrow('DB read error');
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'admin-read-model',
        level: 'error',
        message: 'getRecurringPayables failed',
      }),
    );
  });
});
