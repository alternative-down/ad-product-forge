import { describe, expect, it } from 'vitest';
import { GitHubAppNotActiveError } from './credentials.errors';

describe('GitHubAppNotActiveError', () => {
  it('preserves verbatim message', () => {
    const err = new GitHubAppNotActiveError('agent-123');
    expect(err).toBeInstanceOf(GitHubAppNotActiveError);
    expect(err.name).toBe('GitHubAppNotActiveError');
    expect(err.code).toBe('GITHUB_APP_NOT_ACTIVE');
    expect(err.agentId).toBe('agent-123');
    expect(err.message).toBe('GitHub App not active for agent agent-123');
  });
});
