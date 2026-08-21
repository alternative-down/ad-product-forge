import { describe, expect, it } from 'vitest';
import { GitHubIntegrationNotConfiguredError } from './tools.errors';

describe('GitHubIntegrationNotConfiguredError', () => {
  it('preserves verbatim message', () => {
    const err = new GitHubIntegrationNotConfiguredError();
    expect(err).toBeInstanceOf(GitHubIntegrationNotConfiguredError);
    expect(err.name).toBe('GitHubIntegrationNotConfiguredError');
    expect(err.code).toBe('GITHUB_INTEGRATION_NOT_CONFIGURED');
    expect(err.message).toBe('GitHub integration is not configured at the platform level.');
  });
});
