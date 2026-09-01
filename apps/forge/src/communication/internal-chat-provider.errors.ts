/**
 * Typed Error subclasses for the communication/internal-chat-provider module (Pattern L, D51 #6502 batch 22).
 *
 * Replaces 2 raw `throw new Error(...)` calls in internal-chat-provider.ts with 2 typed
 * Error subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/communication/internal-chat-provider.ts collapse to 2 typed Error classes.
 * Message format is preserved verbatim for backward compatibility with
 * existing `.rejects.toThrow(<substring>)` tests in internal-chat-provider.test.ts.
 *
 * Pattern reference: apps/forge/src/webhooks/store.errors.ts (D51 batch 21 — Varek),
 * apps/forge/src/coolify/helpers.errors.ts (D51 batch 20 — Varek).
 */

export class InternalChatAccountNotFoundError extends Error {
  readonly code = 'INTERNAL_CHAT_ACCOUNT_NOT_FOUND' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`Internal chat account not found for agent: ${agentId}`);
    this.name = 'InternalChatAccountNotFoundError';
    this.agentId = agentId;
  }
}

export class InternalChatDispatchFailedError extends Error {
  readonly code = 'INTERNAL_CHAT_DISPATCH_FAILED' as const;
  readonly serviceErrorMessage: string;
  constructor(serviceErrorMessage: string) {
    super(serviceErrorMessage);
    this.name = 'InternalChatDispatchFailedError';
    this.serviceErrorMessage = serviceErrorMessage;
  }
}
