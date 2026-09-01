import { describe, expect, test } from 'vitest';

import {
  CannotReduceBudgetBelowSpentError,
  InsufficientCompanyCashError,
  NoActiveContractError,
} from './adjust-agent-contract-budget.errors';

describe('agents/adjust-agent-contract-budget errors', () => {
  describe('NoActiveContractError', () => {
    test('preserves verbatim message with agent id', () => {
      const err = new NoActiveContractError('agent-1');
      expect(err).toBeInstanceOf(NoActiveContractError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('NoActiveContractError');
      expect(err.code).toBe('NO_ACTIVE_CONTRACT');
      expect(err.agentId).toBe('agent-1');
      expect(err.message).toBe('No active contract for agent: agent-1');
    });

    test('handles UUID-style agent id', () => {
      const err = new NoActiveContractError('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(err.message).toContain('No active contract for agent:');
      expect(err.message).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
  });

  describe('InsufficientCompanyCashError', () => {
    test('preserves verbatim message', () => {
      const err = new InsufficientCompanyCashError();
      expect(err).toBeInstanceOf(InsufficientCompanyCashError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('InsufficientCompanyCashError');
      expect(err.code).toBe('INSUFFICIENT_COMPANY_CASH');
      expect(err.message).toBe('Insufficient company cash for budget increase');
    });
  });

  describe('CannotReduceBudgetBelowSpentError', () => {
    test('preserves verbatim message with 6-decimal precision', () => {
      const err = new CannotReduceBudgetBelowSpentError(15.123456789, 10.0);
      expect(err).toBeInstanceOf(CannotReduceBudgetBelowSpentError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('CannotReduceBudgetBelowSpentError');
      expect(err.code).toBe('CANNOT_REDUCE_BUDGET_BELOW_SPENT');
      expect(err.contractSpendUsd).toBe(15.123456789);
      expect(err.newBudgetUsd).toBe(10.0);
      expect(err.message).toBe(
        'Cannot reduce budget below spent amount (15.123457 USD). New budget must be at least 15.123457 USD.',
      );
    });

    test('handles zero spent amount', () => {
      const err = new CannotReduceBudgetBelowSpentError(0, -1);
      expect(err.contractSpendUsd).toBe(0);
      expect(err.message).toBe(
        'Cannot reduce budget below spent amount (0.000000 USD). New budget must be at least 0.000000 USD.',
      );
    });
  });
});
