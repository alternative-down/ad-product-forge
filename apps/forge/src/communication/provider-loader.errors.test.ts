import { describe, expect, it } from 'vitest';
import { CommunicationProviderMissingServiceError } from './provider-loader.errors';

describe('CommunicationProviderMissingServiceError', () => {
  it('preserves verbatim message', () => {
    const err = new CommunicationProviderMissingServiceError();
    expect(err).toBeInstanceOf(CommunicationProviderMissingServiceError);
    expect(err.name).toBe('CommunicationProviderMissingServiceError');
    expect(err.code).toBe('COMMUNICATION_PROVIDER_MISSING_SERVICE');
    expect(err.message).toBe('Internal chat provider requires the internalChat service');
  });
});
