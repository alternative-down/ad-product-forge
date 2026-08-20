/**
 * Unit tests for email/migadu-manager.errors.ts.
 * All 5 exported error classes — 0 prior coverage.
 */
import { describe, expect, it } from 'vitest';

import {
  MigaduDomainDerivationError,
  MigaduProviderConfigMissingError,
  MailboxLocalPartDerivationError,
  InvalidMailboxAddressError,
  MigaduCredentialsParseError,
} from './migadu-manager.errors';

describe('MigaduDomainDerivationError', () => {
  it('has correct name and message', () => {
    const error = new MigaduDomainDerivationError('admin@acme.com');
    expect(error.name).toBe('MigaduDomainDerivationError');
    expect(error.message).toBe('Cannot derive Migadu domain from API user: admin@acme.com');
  });

  it('exposes apiUser field', () => {
    const error = new MigaduDomainDerivationError('admin@acme.com');
    expect(error.apiUser).toBe('admin@acme.com');
  });

  it('is an instance of Error', () => {
    const error = new MigaduDomainDerivationError('x');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('MigaduProviderConfigMissingError', () => {
  it('has correct name and message', () => {
    const error = new MigaduProviderConfigMissingError();
    expect(error.name).toBe('MigaduProviderConfigMissingError');
    expect(error.message).toBe(
      'Migadu email provisioning requires a configured admin connection in system integrations',
    );
  });

  it('is an instance of Error', () => {
    const error = new MigaduProviderConfigMissingError();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('MailboxLocalPartDerivationError', () => {
  it('has correct name and message', () => {
    const error = new MailboxLocalPartDerivationError('agent_001');
    expect(error.name).toBe('MailboxLocalPartDerivationError');
    expect(error.message).toBe('Cannot derive mailbox local part from agent id: agent_001');
  });

  it('exposes agentId field', () => {
    const error = new MailboxLocalPartDerivationError('agent_001');
    expect(error.agentId).toBe('agent_001');
  });

  it('is an instance of Error', () => {
    const error = new MailboxLocalPartDerivationError('x');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('InvalidMailboxAddressError', () => {
  it('has correct name and message', () => {
    const error = new InvalidMailboxAddressError('not-an-email');
    expect(error.name).toBe('InvalidMailboxAddressError');
    expect(error.message).toBe('Invalid mailbox address: not-an-email');
  });

  it('exposes address field', () => {
    const error = new InvalidMailboxAddressError('not-an-email');
    expect(error.address).toBe('not-an-email');
  });

  it('is an instance of Error', () => {
    const error = new InvalidMailboxAddressError('x');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('MigaduCredentialsParseError', () => {
  it('decrypt variant has correct name and message', () => {
    const error = new MigaduCredentialsParseError(
      'agent_001',
      'decrypt',
      'Failed to decrypt email credentials for agent agent_001: bad key',
    );
    expect(error.name).toBe('MigaduCredentialsParseError');
    expect(error.message).toBe('Failed to decrypt email credentials for agent agent_001: bad key');
    expect(error.stage).toBe('decrypt');
    expect(error.agentId).toBe('agent_001');
  });

  it('json variant exposes json stage', () => {
    const error = new MigaduCredentialsParseError(
      'a',
      'json',
      'Failed to parse email credentials JSON for agent a: unexpected token',
    );
    expect(error.stage).toBe('json');
    expect(error.agentId).toBe('a');
  });

  it('schema variant exposes schema stage', () => {
    const error = new MigaduCredentialsParseError(
      'a',
      'schema',
      'Email provider credentials schema validation failed for agent a: invalid',
    );
    expect(error.stage).toBe('schema');
    expect(error.agentId).toBe('a');
  });

  it('is an instance of Error', () => {
    const error = new MigaduCredentialsParseError('a', 'decrypt', 'msg');
    expect(error).toBeInstanceOf(Error);
  });
});
