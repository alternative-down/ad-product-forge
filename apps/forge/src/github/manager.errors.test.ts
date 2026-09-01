/**
 * Unit tests for github/manager.errors.ts.
 * All 3 exported error classes — 0 prior coverage.
 */
import { describe, expect, it } from 'vitest';

import {
  ParseCredentialsNotInitializedError,
  CreateGitHubAppNotInitializedError,
  OpsRoutingNotInitializedError,
} from './manager.errors';

describe('ParseCredentialsNotInitializedError', () => {
  it('has correct name and message', () => {
    const error = new ParseCredentialsNotInitializedError();
    expect(error.name).toBe('ParseCredentialsNotInitializedError');
    expect(error.message).toBe('parseCredentials not initialized');
  });

  it('is an instance of Error', () => {
    const error = new ParseCredentialsNotInitializedError();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('CreateGitHubAppNotInitializedError', () => {
  it('has correct name and message', () => {
    const error = new CreateGitHubAppNotInitializedError();
    expect(error.name).toBe('CreateGitHubAppNotInitializedError');
    expect(error.message).toBe('createGitHubApp not initialized');
  });

  it('is an instance of Error', () => {
    const error = new CreateGitHubAppNotInitializedError();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('OpsRoutingNotInitializedError', () => {
  it('has correct name and message', () => {
    const error = new OpsRoutingNotInitializedError();
    expect(error.name).toBe('OpsRoutingNotInitializedError');
    expect(error.message).toBe('opsRouting not initialized');
  });

  it('is an instance of Error', () => {
    const error = new OpsRoutingNotInitializedError();
    expect(error).toBeInstanceOf(Error);
  });
});
