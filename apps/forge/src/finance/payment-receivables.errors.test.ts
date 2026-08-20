import { describe, expect, test } from 'vitest';

import {
  ProcessPaymentEventLedgerInsertMissingRowError,
  UpsertCustomerMissingInsertRowError,
  UpsertSubscriptionMissingInsertRowError,
} from './payment-receivables.errors';

describe('finance/payment-receivables errors', () => {
  describe('UpsertCustomerMissingInsertRowError', () => {
    test('preserves verbatim message and context', () => {
      const err = new UpsertCustomerMissingInsertRowError('stripe', 'cus_abc123');
      expect(err).toBeInstanceOf(UpsertCustomerMissingInsertRowError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('UpsertCustomerMissingInsertRowError');
      expect(err.code).toBe('UPSERT_CUSTOMER_MISSING_INSERT_ROW');
      expect(err.provider).toBe('stripe');
      expect(err.providerCustomerId).toBe('cus_abc123');
      expect(err.message).toBe(
        'upsertCustomer: insert returned no row for provider=stripe customerId=cus_abc123',
      );
    });

    test('handles asaas provider', () => {
      const err = new UpsertCustomerMissingInsertRowError('asaas', 'cus_xyz');
      expect(err.message).toContain('provider=asaas');
      expect(err.message).toContain('customerId=cus_xyz');
    });
  });

  describe('UpsertSubscriptionMissingInsertRowError', () => {
    test('preserves verbatim message and context', () => {
      const err = new UpsertSubscriptionMissingInsertRowError('sub_test123');
      expect(err).toBeInstanceOf(UpsertSubscriptionMissingInsertRowError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('UpsertSubscriptionMissingInsertRowError');
      expect(err.code).toBe('UPSERT_SUBSCRIPTION_MISSING_INSERT_ROW');
      expect(err.providerSubscriptionId).toBe('sub_test123');
      expect(err.message).toBe(
        'upsertSubscription: insert returned no row for providerSubscriptionId=sub_test123',
      );
    });
  });

  describe('ProcessPaymentEventLedgerInsertMissingRowError', () => {
    test('preserves verbatim message and context', () => {
      const err = new ProcessPaymentEventLedgerInsertMissingRowError('tx_evt_001');
      expect(err).toBeInstanceOf(ProcessPaymentEventLedgerInsertMissingRowError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ProcessPaymentEventLedgerInsertMissingRowError');
      expect(err.code).toBe('PROCESS_PAYMENT_EVENT_LEDGER_INSERT_MISSING_ROW');
      expect(err.txId).toBe('tx_evt_001');
      expect(err.message).toBe(
        'processPaymentEvent: ledger insert returned no row for txId=tx_evt_001',
      );
    });

    test('handles different tx id format', () => {
      const err = new ProcessPaymentEventLedgerInsertMissingRowError('pi_3Mze7t2eZvKYlo2C0F4F2g7T');
      expect(err.message).toContain('txId=pi_3Mze7t2eZvKYlo2C0F4F2g7T');
    });
  });
});
