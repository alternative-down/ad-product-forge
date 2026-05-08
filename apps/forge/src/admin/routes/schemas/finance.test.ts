/**
 * Expansion tests for admin/routes/schemas/finance.ts.
 * createPayableSchema (discriminated union) — zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { createPayableSchema } from './finance';

// ─── createPayableSchema ─────────────────────────────────────────────────────

describe('createPayableSchema — agent_contract kind', () => {
  it('parses minimal valid input', () => {
    const result = createPayableSchema.parse({
      kind: 'agent_contract',
      agentId: 'agent-123',
      amount: 100,
    });
    expect(result.kind).toBe('agent_contract');
    expect(result.agentId).toBe('agent-123');
    expect(result.amount).toBe(100);
  });

  it('parses with optional description', () => {
    const result = createPayableSchema.parse({
      kind: 'agent_contract', agentId: 'a', amount: 50, description: 'Monthly fee',
    });
    expect(result.description).toBe('Monthly fee');
  });

  it('rejects missing agentId', () => {
    expect(() => createPayableSchema.parse({ kind: 'agent_contract', amount: 100 })).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() => createPayableSchema.parse({ kind: 'agent_contract', agentId: '', amount: 100 })).toThrow();
  });

  it('rejects missing amount', () => {
    expect(() => createPayableSchema.parse({ kind: 'agent_contract', agentId: 'a' })).toThrow();
  });

  it('rejects zero amount', () => {
    expect(() => createPayableSchema.parse({ kind: 'agent_contract', agentId: 'a', amount: 0 })).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() => createPayableSchema.parse({ kind: 'agent_contract', agentId: 'a', amount: -10 })).toThrow();
  });
});

describe('createPayableSchema — system_expense kind', () => {
  it('parses minimal valid input', () => {
    const result = createPayableSchema.parse({
      kind: 'system_expense',
      description: 'AWS bill',
      amount: 250,
      category: 'infrastructure',
    });
    expect(result.kind).toBe('system_expense');
    expect(result.description).toBe('AWS bill');
    expect(result.amount).toBe(250);
    expect(result.category).toBe('infrastructure');
  });

  it('rejects missing description', () => {
    expect(() => createPayableSchema.parse({ kind: 'system_expense', amount: 10, category: 'c' })).toThrow();
  });

  it('rejects empty description', () => {
    expect(() => createPayableSchema.parse({ kind: 'system_expense', description: '', amount: 10, category: 'c' })).toThrow();
  });

  it('rejects missing amount', () => {
    expect(() => createPayableSchema.parse({ kind: 'system_expense', description: 'd', category: 'c' })).toThrow();
  });

  it('rejects zero amount', () => {
    expect(() => createPayableSchema.parse({ kind: 'system_expense', description: 'd', amount: 0, category: 'c' })).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() => createPayableSchema.parse({ kind: 'system_expense', description: 'd', amount: -1, category: 'c' })).toThrow();
  });

  it('rejects missing category', () => {
    expect(() => createPayableSchema.parse({ kind: 'system_expense', description: 'd', amount: 10 })).toThrow();
  });

  it('rejects empty category', () => {
    expect(() => createPayableSchema.parse({ kind: 'system_expense', description: 'd', amount: 10, category: '' })).toThrow();
  });
});

describe('createPayableSchema — invalid kind', () => {
  it('rejects invalid kind value', () => {
    expect(() => createPayableSchema.parse({ kind: 'unknown', amount: 10 })).toThrow();
  });

  it('rejects missing kind', () => {
    expect(() => createPayableSchema.parse({ amount: 10 })).toThrow();
  });
});

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('createPayableSchema.safeParse', () => {
  it('returns success true for valid agent_contract', () => {
    const result = createPayableSchema.safeParse({ kind: 'agent_contract', agentId: 'a', amount: 10 });
    expect(result.success).toBe(true);
  });

  it('returns success true for valid system_expense', () => {
    const result = createPayableSchema.safeParse({ kind: 'system_expense', description: 'd', amount: 10, category: 'c' });
    expect(result.success).toBe(true);
  });

  it('returns success false for missing amount', () => {
    const result = createPayableSchema.safeParse({ kind: 'agent_contract', agentId: 'a' });
    expect(result.success).toBe(false);
  });

  it('returns success false for wrong kind', () => {
    const result = createPayableSchema.safeParse({ kind: 'other', amount: 10 });
    expect(result.success).toBe(false);
  });
});