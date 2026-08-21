/**
 * Tests for Pattern L typed Errors in github/ops module (D52 #6628 batch 1).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields (agentId) are exposed on the error for downstream consumers
 *
 * See apps/forge/src/github/ops/errors.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  GithubAppAlreadyExistsError,
  GithubAppDoesNotExistError,
  GithubIntegrationNotConfiguredError,
} from './errors';

describe('github/ops/errors — Pattern L typed Errors (D52 #6628 batch 1)', () => {
  it('GithubIntegrationNotConfiguredError preserves verbatim message', () => {
    const error = new GithubIntegrationNotConfiguredError();
    expect(error).toBeInstanceOf(GithubIntegrationNotConfiguredError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('GITHUB_INTEGRATION_NOT_CONFIGURED');
    expect(error.name).toBe('GithubIntegrationNotConfiguredError');
    expect(error.message).toBe('GitHub integration is not configured');
  });

  it('GithubAppAlreadyExistsError captures agentId and preserves message', () => {
    const agentId = 'agent-123';
    const error = new GithubAppAlreadyExistsError(agentId);
    expect(error).toBeInstanceOf(GithubAppAlreadyExistsError);
    expect(error.code).toBe('GITHUB_APP_ALREADY_EXISTS');
    expect(error.agentId).toBe(agentId);
    expect(error.message).toBe('GitHub App already exists for agent agent-123');
  });

  it('GithubAppDoesNotExistError captures agentId and preserves message', () => {
    const agentId = 'agent-456';
    const error = new GithubAppDoesNotExistError(agentId);
    expect(error).toBeInstanceOf(GithubAppDoesNotExistError);
    expect(error.code).toBe('GITHUB_APP_DOES_NOT_EXIST');
    expect(error.agentId).toBe(agentId);
    expect(error.message).toBe('GitHub App does not exist for agent agent-456');
  });
});
