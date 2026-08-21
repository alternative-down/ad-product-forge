import { describe, expect, it } from 'vitest';

import {
  EmailProviderDisposedError,
  EmailSendMissingTargetKeyError,
} from './email-account.errors';

describe('EmailProviderDisposedError', () => {
  it('preserves verbatim message format', () => {
    const err = new EmailProviderDisposedError();
    expect(err).toBeInstanceOf(EmailProviderDisposedError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('EmailProviderDisposedError');
    expect(err.code).toBe('EMAIL_PROVIDER_DISPOSED');
    expect(err.message).toBe('Email provider is disposed');
    expect(err.stack).toBeDefined();
  });
});

describe('EmailSendMissingTargetKeyError', () => {
  it('preserves verbatim message format', () => {
    const err = new EmailSendMissingTargetKeyError();
    expect(err).toBeInstanceOf(EmailSendMissingTargetKeyError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('EmailSendMissingTargetKeyError');
    expect(err.code).toBe('EMAIL_SEND_MISSING_TARGET_KEY');
    expect(err.message).toBe('[email] Cannot send without a targetKey');
    expect(err.stack).toBeDefined();
  });
});
