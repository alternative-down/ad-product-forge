/**
 * Typed Error subclasses for the finance/payment-receivables module (Pattern L, D51 #6502 batch 14).
 *
 * Replaces 3 raw `throw new Error(...)` calls in payment-receivables.ts with 3 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 3 literal `throw new Error(...)` calls in
 * apps/forge/src/finance/payment-receivables.ts collapse to 3 typed Error classes.
 * Message format is preserved verbatim for backward compatibility with
 * existing test substrings and #6015 L#NN-46 transaction semantics.
 *
 * Pattern reference: apps/forge/src/encryption/crypto.errors.ts (D51 batch 13 — Varek, this sprint),
 * apps/forge/src/coolify/manager.errors.ts (D51 batch 13 batch-A — Varek, this sprint).
 */

export class UpsertCustomerMissingInsertRowError extends Error {
  readonly code = 'UPSERT_CUSTOMER_MISSING_INSERT_ROW' as const;
  readonly provider: string;
  readonly providerCustomerId: string;
  constructor(provider: string, providerCustomerId: string) {
    super(
      `upsertCustomer: insert returned no row for provider=${provider} customerId=${providerCustomerId}`,
    );
    this.name = 'UpsertCustomerMissingInsertRowError';
    this.provider = provider;
    this.providerCustomerId = providerCustomerId;
  }
}

export class UpsertSubscriptionMissingInsertRowError extends Error {
  readonly code = 'UPSERT_SUBSCRIPTION_MISSING_INSERT_ROW' as const;
  readonly providerSubscriptionId: string;
  constructor(providerSubscriptionId: string) {
    super(
      `upsertSubscription: insert returned no row for providerSubscriptionId=${providerSubscriptionId}`,
    );
    this.name = 'UpsertSubscriptionMissingInsertRowError';
    this.providerSubscriptionId = providerSubscriptionId;
  }
}

export class ProcessPaymentEventLedgerInsertMissingRowError extends Error {
  readonly code = 'PROCESS_PAYMENT_EVENT_LEDGER_INSERT_MISSING_ROW' as const;
  readonly txId: string;
  constructor(txId: string) {
    super(
      `processPaymentEvent: ledger insert returned no row for txId=${txId}`,
    );
    this.name = 'ProcessPaymentEventLedgerInsertMissingRowError';
    this.txId = txId;
  }
}
