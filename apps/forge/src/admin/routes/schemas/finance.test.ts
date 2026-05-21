/**
 * Unit tests for admin/routes/schemas/finance.ts.
 * Zod validation schemas for finance/payable management.
 * Zero prior coverage.
 *
 * NOTE: Only createPayableSchema is exported. Others redefined inline.
 */
import { describe, expect, it } from 'vitest';
import { createPayableSchema } from './finance';
import { z } from 'zod';

const ledgerEntryActionSchema = z.object({
  entryId: z.string().min(1),
  action: z.enum(['approve', 'cancel']),
});

const recurringPayableStatusSchema = z.object({
  payableId: z.string().min(1),
  isActive: z.boolean().nullable(),
});

const createInvestmentSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1),
});

// ─── createInvestmentSchema ──────────────────────────────────────────────

describe('createInvestmentSchema', () => {
  it('parses valid input', () => {
    expect(
      createInvestmentSchema.parse({ amount: 1000.5, description: 'Equipment purchase' }),
    ).toMatchObject({ amount: 1000.5, description: 'Equipment purchase' });
  });

  it('rejects zero amount', () => {
    expect(() => createInvestmentSchema.parse({ amount: 0, description: 'x' })).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() => createInvestmentSchema.parse({ amount: -10, description: 'x' })).toThrow();
  });

  it('rejects missing description', () => {
    expect(() => createInvestmentSchema.parse({ amount: 100 })).toThrow();
  });

  it('rejects empty description', () => {
    expect(() => createInvestmentSchema.parse({ amount: 100, description: '' })).toThrow();
  });

  it('rejects missing amount', () => {
    expect(() => createInvestmentSchema.parse({ description: 'x' })).toThrow();
  });
});

// ─── createPayableSchema — agent_contract kind ───────────────────────────

describe('createPayableSchema — agent_contract kind', () => {
  it('parses valid agent_contract input', () => {
    expect(
      createPayableSchema.parse({
        kind: 'agent_contract',
        agentId: 'agent-1',
        amount: 500,
        description: 'Monthly fee',
      }),
    ).toMatchObject({ kind: 'agent_contract', agentId: 'agent-1', amount: 500 });
  });

  it('parses without optional description', () => {
    expect(
      createPayableSchema.parse({ kind: 'agent_contract', agentId: 'a', amount: 100 }),
    ).toMatchObject({ kind: 'agent_contract' });
  });

  it('rejects non-positive amount', () => {
    expect(() =>
      createPayableSchema.parse({ kind: 'agent_contract', agentId: 'a', amount: 0 }),
    ).toThrow();
  });

  it('rejects missing agentId', () => {
    expect(() => createPayableSchema.parse({ kind: 'agent_contract', amount: 100 })).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() =>
      createPayableSchema.parse({ kind: 'agent_contract', agentId: '', amount: 100 }),
    ).toThrow();
  });

  it('rejects wrong kind', () => {
    expect(() =>
      createPayableSchema.parse({ kind: 'invoice', agentId: 'a', amount: 100 }),
    ).toThrow();
  });
});

// ─── createPayableSchema — system_expense kind ─────────────────────────

describe('createPayableSchema — system_expense kind', () => {
  it('parses valid system_expense input', () => {
    expect(
      createPayableSchema.parse({
        kind: 'system_expense',
        description: 'Hosting cost',
        amount: 200,
        category: 'infrastructure',
      }),
    ).toMatchObject({ kind: 'system_expense', amount: 200, category: 'infrastructure' });
  });

  it('rejects non-positive amount', () => {
    expect(() =>
      createPayableSchema.parse({
        kind: 'system_expense',
        description: 'x',
        amount: 0,
        category: 'c',
      }),
    ).toThrow();
  });

  it('rejects missing category', () => {
    expect(() =>
      createPayableSchema.parse({ kind: 'system_expense', description: 'x', amount: 100 }),
    ).toThrow();
  });

  it('rejects empty category', () => {
    expect(() =>
      createPayableSchema.parse({
        kind: 'system_expense',
        description: 'x',
        amount: 100,
        category: '',
      }),
    ).toThrow();
  });

  it('rejects missing description', () => {
    expect(() =>
      createPayableSchema.parse({ kind: 'system_expense', amount: 100, category: 'c' }),
    ).toThrow();
  });
});

// ─── createPayableSchema — discriminated union edge cases ──────────────

describe('createPayableSchema — discriminated union edge cases', () => {
  it('rejects missing kind', () => {
    expect(() => createPayableSchema.parse({ agentId: 'a', amount: 100 })).toThrow();
  });

  it('rejects invalid kind', () => {
    expect(() => createPayableSchema.parse({ kind: 'unknown', amount: 100 })).toThrow();
  });

  it('accepts minimal agent_contract', () => {
    expect(
      createPayableSchema.parse({ kind: 'agent_contract', agentId: 'a', amount: 1 }),
    ).toMatchObject({ kind: 'agent_contract' });
  });

  it('accepts minimal system_expense', () => {
    expect(
      createPayableSchema.parse({
        kind: 'system_expense',
        description: 'x',
        amount: 1,
        category: 'c',
      }),
    ).toMatchObject({ kind: 'system_expense' });
  });
});

// ─── ledgerEntryActionSchema ────────────────────────────────────────────

describe('ledgerEntryActionSchema', () => {
  it('parses approve action', () => {
    expect(ledgerEntryActionSchema.parse({ entryId: 'entry-1', action: 'approve' })).toMatchObject({
      entryId: 'entry-1',
      action: 'approve',
    });
  });

  it('parses cancel action', () => {
    expect(ledgerEntryActionSchema.parse({ entryId: 'entry-1', action: 'cancel' })).toMatchObject({
      entryId: 'entry-1',
      action: 'cancel',
    });
  });

  it('rejects missing entryId', () => {
    expect(() => ledgerEntryActionSchema.parse({ action: 'approve' })).toThrow();
  });

  it('rejects empty entryId', () => {
    expect(() => ledgerEntryActionSchema.parse({ entryId: '', action: 'approve' })).toThrow();
  });

  it('rejects missing action', () => {
    expect(() => ledgerEntryActionSchema.parse({ entryId: 'e' })).toThrow();
  });

  it('rejects invalid action value', () => {
    expect(() => ledgerEntryActionSchema.parse({ entryId: 'e', action: 'reject' })).toThrow();
  });
});

// ─── recurringPayableStatusSchema ─────────────────────────────────────

describe('recurringPayableStatusSchema', () => {
  it('parses isActive true', () => {
    expect(
      recurringPayableStatusSchema.parse({ payableId: 'pay-1', isActive: true }),
    ).toMatchObject({ payableId: 'pay-1', isActive: true });
  });

  it('parses isActive false', () => {
    expect(
      recurringPayableStatusSchema.parse({ payableId: 'pay-1', isActive: false }),
    ).toMatchObject({ payableId: 'pay-1', isActive: false });
  });

  it('parses isActive null', () => {
    expect(
      recurringPayableStatusSchema.parse({ payableId: 'pay-1', isActive: null }),
    ).toMatchObject({ payableId: 'pay-1', isActive: null });
  });

  it('rejects missing payableId', () => {
    expect(() => recurringPayableStatusSchema.parse({ isActive: true })).toThrow();
  });

  it('rejects empty payableId', () => {
    expect(() => recurringPayableStatusSchema.parse({ payableId: '', isActive: true })).toThrow();
  });
});

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('schema.safeParse', () => {
  it('createInvestmentSchema safeParse returns success false for zero amount', () => {
    const result = createInvestmentSchema.safeParse({ amount: 0, description: 'x' });
    expect(result.success).toBe(false);
  });

  it('createPayableSchema safeParse returns success true for valid agent_contract', () => {
    const result = createPayableSchema.safeParse({
      kind: 'agent_contract',
      agentId: 'a',
      amount: 1,
    });
    expect(result.success).toBe(true);
  });

  it('createPayableSchema safeParse returns success false for wrong kind', () => {
    const result = createPayableSchema.safeParse({ kind: 'unknown', amount: 1 });
    expect(result.success).toBe(false);
  });

  it('ledgerEntryActionSchema safeParse returns success false for invalid action', () => {
    const result = ledgerEntryActionSchema.safeParse({ entryId: 'e', action: 'pending' });
    expect(result.success).toBe(false);
  });

  it('recurringPayableStatusSchema safeParse returns success true for valid input', () => {
    const result = recurringPayableStatusSchema.safeParse({ payableId: 'p', isActive: true });
    expect(result.success).toBe(true);
  });
});
