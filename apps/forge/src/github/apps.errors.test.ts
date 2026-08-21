import { describe, expect, it } from 'vitest';

import {
  AgentAlreadyHasGitHubCredentialsError,
  AgentMissingGitHubCredentialsToUpdateError,
} from './apps.errors';

describe('AgentAlreadyHasGitHubCredentialsError', () => {
  it('preserves verbatim message with agent id', () => {
    const err = new AgentAlreadyHasGitHubCredentialsError('agent-123');
    expect(err).toBeInstanceOf(AgentAlreadyHasGitHubCredentialsError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AgentAlreadyHasGitHubCredentialsError');
    expect(err.code).toBe('AGENT_ALREADY_HAS_GITHUB_CREDENTIALS');
    expect(err.agentId).toBe('agent-123');
    expect(err.message).toBe('Agent agent-123 already has GitHub credentials');
    expect(err.stack).toBeDefined();
  });

  it('handles uuid-style agent id', () => {
    const err = new AgentAlreadyHasGitHubCredentialsError(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
    expect(err.message).toBe(
      'Agent a1b2c3d4-e5f6-7890-abcd-ef1234567890 already has GitHub credentials',
    );
    expect(err.agentId).toBe(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  });
});

describe('AgentMissingGitHubCredentialsToUpdateError', () => {
  it('preserves verbatim message format for update flow', () => {
    const err = new AgentMissingGitHubCredentialsToUpdateError('agent-456');
    expect(err).toBeInstanceOf(AgentMissingGitHubCredentialsToUpdateError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AgentMissingGitHubCredentialsToUpdateError');
    expect(err.code).toBe('AGENT_MISSING_GITHUB_CREDENTIALS_TO_UPDATE');
    expect(err.agentId).toBe('agent-456');
    expect(err.message).toBe('Agent agent-456 has no GitHub credentials to update');
  });
});
