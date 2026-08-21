/**
 * Typed Error subclasses for the admin/routes/internal-chat/internal-chat-route-helpers module (Pattern L, D52 #6502 batch 33).
 *
 * Replaces 2 raw `throw new Error(...)` calls in internal-chat-route-helpers.ts with 2 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 */

export class AdminInternalChatRequiredFieldMissingError extends Error {
  readonly code = 'ADMIN_INTERNAL_CHAT_REQUIRED_FIELD_MISSING' as const;
  readonly fieldName: string;
  constructor(fieldName: string) {
    super(`${fieldName} required`);
    this.name = 'AdminInternalChatRequiredFieldMissingError';
    this.fieldName = fieldName;
  }
}

export class AdminInternalChatRouteHelperError extends Error {
  readonly code = 'ADMIN_INTERNAL_CHAT_ROUTE_HELPER' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AdminInternalChatRouteHelperError';
  }
}
