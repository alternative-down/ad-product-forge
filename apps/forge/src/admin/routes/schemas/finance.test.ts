/**
 * Unit tests for admin/routes/schemas/finance.ts.
 * Zod validation schemas for finance/payable management.
 * Zero prior coverage.
 *
 * NOTE: Tests previously redefined createInvestmentSchema, ledgerEntryActionSchema,
 * and recurringPayableStatusSchema inline, but the test shapes did not match the
 * production schemas in admin/routes/finance/write.ts. Those phantom tests
 * have been removed — see PR for rationale. Real coverage is now via the
 * production write.ts .parse() calls and unit tests there.
 */
import { describe, expect, it } from 'vitest';
import { createPayableSchema } from './finance';

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

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('schema.safeParse', () => {
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

});
