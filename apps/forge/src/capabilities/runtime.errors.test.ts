import { describe, expect, test } from 'vitest';
import {
  ChangeAgentRolePermissionError,
  ParsedCredentialsShapeMismatchError,
  UpdateInternalChatProviderProfileCredentialsError,
  UpdateInternalChatProviderProfileUpdateError,
} from './errors';

// ── Pattern L D51 #6502 batch 16: typed-Error class tests ──
// Unit tests for capabilities/runtime.ts throw-site replacements.

describe('ParsedCredentialsShapeMismatchError', () => {
  test('preserves exact message', () => {
    const err = new ParsedCredentialsShapeMismatchError();
    expect(err.name).toBe('ParsedCredentialsShapeMismatchError');
    expect(err.code).toBe('PARSED_CREDENTIALS_SHAPE_MISMATCH');
    expect(err.message).toBe('Parsed credentials do not match StoredCredentials shape');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ParsedCredentialsShapeMismatchError);
  });
});

describe('UpdateInternalChatProviderProfileCredentialsError', () => {
  test('preserves agentId and Error cause message', () => {
    const cause = new Error('JSON parse failure');
    const err = new UpdateInternalChatProviderProfileCredentialsError(
      'agent-007',
      cause,
    );
    expect(err.name).toBe('UpdateInternalChatProviderProfileCredentialsError');
    expect(err.code).toBe('UPDATE_INTERNAL_CHAT_PROVIDER_PROFILE_CREDENTIALS');
    expect(err.agentId).toBe('agent-007');
    expect(err.originalError).toBe(cause);
    expect(err.message).toBe(
      'updateInternalChatProviderProfile: failed to decrypt/parse credentials for agent agent-007: JSON parse failure',
    );
  });

  test('handles string cause', () => {
    const err = new UpdateInternalChatProviderProfileCredentialsError(
      'agent-1',
      'unknown',
    );
    expect(err.originalError).toBe('unknown');
    expect(err.message).toBe(
      'updateInternalChatProviderProfile: failed to decrypt/parse credentials for agent agent-1: unknown',
    );
  });
});

describe('UpdateInternalChatProviderProfileUpdateError', () => {
  test('preserves agentId and Error cause', () => {
    const cause = new Error('drizzle ORM constraint');
    const err = new UpdateInternalChatProviderProfileUpdateError(
      'agent-42',
      cause,
    );
    expect(err.name).toBe('UpdateInternalChatProviderProfileUpdateError');
    expect(err.code).toBe('UPDATE_INTERNAL_CHAT_PROVIDER_PROFILE_UPDATE');
    expect(err.agentId).toBe('agent-42');
    expect(err.originalError).toBe(cause);
    expect(err.message).toBe(
      'updateInternalChatProviderProfile: failed to update provider for agent agent-42: drizzle ORM constraint',
    );
  });
});

describe('ChangeAgentRolePermissionError', () => {
  test('preserves actor and target agent IDs', () => {
    const err = new ChangeAgentRolePermissionError('actor-1', 'target-9');
    expect(err.name).toBe('ChangeAgentRolePermissionError');
    expect(err.code).toBe('CHANGE_AGENT_ROLE_PERMISSION');
    expect(err.actorAgentId).toBe('actor-1');
    expect(err.targetAgentId).toBe('target-9');
    expect(err.message).toBe('Agent actor-1 cannot change role for target-9');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ChangeAgentRolePermissionError);
  });
});
