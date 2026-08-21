import { describe, expect, it } from 'vitest';

import {
  AdminInternalChatRequiredFieldMissingError,
  AdminInternalChatRouteHelperError,
} from './internal-chat-route-helpers.errors';

describe('AdminInternalChatRequiredFieldMissingError', () => {
  it('preserves verbatim message format', () => {
    const err = new AdminInternalChatRequiredFieldMissingError('targetKey');
    expect(err).toBeInstanceOf(AdminInternalChatRequiredFieldMissingError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AdminInternalChatRequiredFieldMissingError');
    expect(err.code).toBe('ADMIN_INTERNAL_CHAT_REQUIRED_FIELD_MISSING');
    expect(err.fieldName).toBe('targetKey');
    expect(err.message).toBe('targetKey required');
    expect(err.stack).toBeDefined();
  });
});

describe('AdminInternalChatRouteHelperError', () => {
  it('preserves verbatim message format', () => {
    const err = new AdminInternalChatRouteHelperError('Operation failed: invalid state');
    expect(err).toBeInstanceOf(AdminInternalChatRouteHelperError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AdminInternalChatRouteHelperError');
    expect(err.code).toBe('ADMIN_INTERNAL_CHAT_ROUTE_HELPER');
    expect(err.message).toBe('Operation failed: invalid state');
    expect(err.stack).toBeDefined();
  });
});
