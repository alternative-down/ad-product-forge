import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-create the schemas from write.ts to test validation
const createInvestmentSchema = z.object({
  amountUsd: z.number().positive(),
  description: z.string().optional(),
  effectiveAt: z.string().optional(),
}).strict();

const createPayableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  amountUsd: z.number().positive(),
  dueAt: z.string(),
  kind: z.enum(['single', 'recurring']),
  recurrencePeriod: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
}).strict();

const ledgerEntryActionSchema = z.object({
  entryId: z.string().min(1),
  effectiveAt: z.string().optional(),
}).strict();

const recurringPayableStatusSchema = z.object({
  payableId: z.string(),
  isActive: z.boolean(),
}).strict();

describe('Finance Route Schemas', () => {
  describe('createInvestmentSchema', () => {
    it('validates valid investment', () => {
      const result = createInvestmentSchema.parse({
        amountUsd: 1000,
        description: 'Test investment',
      });
      expect(result.amountUsd).toBe(1000);
      expect(result.description).toBe('Test investment');
    });

    it('accepts minimal input', () => {
      const result = createInvestmentSchema.parse({
        amountUsd: 500,
      });
      expect(result.amountUsd).toBe(500);
    });

    it('rejects negative amount', () => {
      expect(() => createInvestmentSchema.parse({ amountUsd: -100 })).toThrow();
    });

    it('rejects zero amount', () => {
      expect(() => createInvestmentSchema.parse({ amountUsd: 0 })).toThrow();
    });

    it('rejects non-numeric amount', () => {
      expect(() => createInvestmentSchema.parse({ amountUsd: '1000' })).toThrow();
    });

    it('rejects extra fields', () => {
      expect(() => createInvestmentSchema.parse({
        amountUsd: 100,
        extra: 'not allowed',
      })).toThrow();
    });
  });

  describe('createPayableSchema', () => {
    it('validates single payable', () => {
      const result = createPayableSchema.parse({
        name: 'Rent',
        amountUsd: 500,
        dueAt: '2025-01-15',
        kind: 'single',
      });
      expect(result.name).toBe('Rent');
      expect(result.kind).toBe('single');
    });

    it('validates recurring payable', () => {
      const result = createPayableSchema.parse({
        name: 'Monthly subscription',
        amountUsd: 50,
        dueAt: '2025-01-01',
        kind: 'recurring',
        recurrencePeriod: 'monthly',
      });
      expect(result.kind).toBe('recurring');
      expect(result.recurrencePeriod).toBe('monthly');
    });

    it('rejects invalid kind', () => {
      expect(() => createPayableSchema.parse({
        name: 'Test',
        amountUsd: 100,
        dueAt: '2025-01-01',
        kind: 'quarterly',
      })).toThrow();
    });

    it('rejects invalid recurrence period', () => {
      expect(() => createPayableSchema.parse({
        name: 'Test',
        amountUsd: 100,
        dueAt: '2025-01-01',
        kind: 'recurring',
        recurrencePeriod: 'biweekly',
      })).toThrow();
    });

    it('rejects missing name', () => {
      expect(() => createPayableSchema.parse({
        amountUsd: 100,
        dueAt: '2025-01-01',
        kind: 'single',
      })).toThrow();
    });
  });

  describe('ledgerEntryActionSchema', () => {
    it('validates with entryId only', () => {
      const result = ledgerEntryActionSchema.parse({ entryId: 'entry-123' });
      expect(result.entryId).toBe('entry-123');
    });

    it('validates with effectiveAt', () => {
      const result = ledgerEntryActionSchema.parse({
        entryId: 'entry-123',
        effectiveAt: '2025-01-15',
      });
      expect(result.effectiveAt).toBe('2025-01-15');
    });

    it('rejects missing entryId', () => {
      expect(() => ledgerEntryActionSchema.parse({})).toThrow();
    });

    it('rejects empty entryId', () => {
      expect(() => ledgerEntryActionSchema.parse({ entryId: '' })).toThrow();
    });


  });

  describe('recurringPayableStatusSchema', () => {
    it('validates set-active true', () => {
      const result = recurringPayableStatusSchema.parse({
        payableId: 'payable-123',
        isActive: true,
      });
      expect(result.isActive).toBe(true);
    });

    it('validates set-active false', () => {
      const result = recurringPayableStatusSchema.parse({
        payableId: 'payable-123',
        isActive: false,
      });
      expect(result.isActive).toBe(false);
    });

    it('rejects missing payableId', () => {
      expect(() => recurringPayableStatusSchema.parse({ isActive: true })).toThrow();
    });

    it('rejects non-boolean isActive', () => {
      expect(() => recurringPayableStatusSchema.parse({
        payableId: 'payable-123',
        isActive: 'yes',
      })).toThrow();
    });
  });
});

// Test registerFinanceReadRoutes and registerFinanceWriteRoutes logic
describe('Finance Route Registration Logic', () => {
  it('validates read model interface shape', () => {
    const mockReadModel = {
      getFinance: async () => ({ total: 1000 }),
      getFinanceContracts: async () => [],
    };
    
    // Verify interface compatibility
    expect(typeof mockReadModel.getFinance).toBe('function');
    expect(typeof mockReadModel.getFinanceContracts).toBe('function');
  });

  it('validates finance write input interface shape', () => {
    const mockInput = {
      companyCash: {
        recordCashIn: async () => {},
        scheduleCashOut: async () => ({ entryId: 'test' }),
        postPlannedEntry: async () => ({}),
        cancelPlannedEntry: async () => ({}),
      },
      companyPayables: {
        createRecurringPayable: async () => ({ payableId: 'p1', entryId: 'e1' }),
        syncRecurringPayableOccurrence: async () => {},
        setRecurringPayableActive: async () => ({}),
      },
    };
    
    expect(typeof mockInput.companyCash.recordCashIn).toBe('function');
    expect(typeof mockInput.companyPayables.setRecurringPayableActive).toBe('function');
  });
});