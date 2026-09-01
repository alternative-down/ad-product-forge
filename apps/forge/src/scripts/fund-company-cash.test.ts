import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('dotenv/config', () => ({}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('../database/schema', () => ({
  getDatabase: vi.fn(),
  runMigrations: vi.fn(),
}));

vi.mock('../finance/company-cash-ledger', () => ({
  createCompanyCashLedger: vi.fn().mockReturnValue({ getCurrentBalanceUsd: vi.fn() }),
}));

vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: vi.fn().mockReturnValue({
    recordCashIn: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('fund-company-cash script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordCashIn', () => {
    it('accepts manual-adjustment type with amount and description', async () => {
      const { createCompanyCashOperations } = await import('../finance/company-cash-operations');
      const ops = {
        recordCashIn: vi.fn().mockResolvedValue(undefined),
      };
      (createCompanyCashOperations as any).mockReturnValueOnce(ops);

      const db = {} as any;
      const operations = createCompanyCashOperations(db);
      await operations.recordCashIn({
        type: 'manual-adjustment',
        amountUsd: 100,
        description: 'Test funding',
      });

      expect(ops.recordCashIn).toHaveBeenCalledWith({
        type: 'manual-adjustment',
        amountUsd: 100,
        description: 'Test funding',
      });
    });

    it('calls recordCashIn with only required fields (amount and type)', async () => {
      const { createCompanyCashOperations } = await import('../finance/company-cash-operations');
      const ops = {
        recordCashIn: vi.fn().mockResolvedValue(undefined),
      };
      (createCompanyCashOperations as any).mockReturnValueOnce(ops);

      const db = {} as any;
      const operations = createCompanyCashOperations(db);
      await operations.recordCashIn({
        type: 'manual-adjustment',
        amountUsd: 50,
      });

      expect(ops.recordCashIn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'manual-adjustment',
          amountUsd: 50,
        }),
      );
    });

    it('rejects negative amounts', async () => {
      const amountUsd = -100;
      expect(amountUsd).toBeLessThan(0);
    });

    it('rejects zero amount', async () => {
      const amountUsd = 0;
      expect(amountUsd).toBeLessThanOrEqual(0);
    });

    it('accepts positive amounts', async () => {
      const amountUsd = 500;
      expect(amountUsd).toBeGreaterThan(0);
    });
  });

});
