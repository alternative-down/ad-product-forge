/**
 * Typed Error subclasses for the email/migadu-manager module (Pattern L, D51 #6502 batch 9).
 *
 * Replaces 7 raw `throw new Error(...)` calls in migadu-manager.ts with 5 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Pattern reference: apps/forge/src/communication/internal-chat-service.errors.ts (D50 #6502 batch 6),
 * apps/forge/src/agents/bundled-workspace-skills.errors.ts (D51 #6502 batch 8).
 *
 * Migration impact: 7 literal `throw new Error(...)` calls in
 * apps/forge/src/email/migadu-manager.ts collapse to 5 typed Error classes.
 * Message format is preserved for backward compatibility with existing tests.
 */

export class MigaduDomainDerivationError extends Error {
  readonly apiUser: string;

  constructor(apiUser: string) {
    super(`Cannot derive Migadu domain from API user: ${apiUser}`);
    this.name = 'MigaduDomainDerivationError';
    this.apiUser = apiUser;
  }
}

export class MigaduProviderConfigMissingError extends Error {
  constructor() {
    super(
      'Migadu email provisioning requires a configured admin connection in system integrations',
    );
    this.name = 'MigaduProviderConfigMissingError';
  }
}

export class MailboxLocalPartDerivationError extends Error {
  readonly agentId: string;

  constructor(agentId: string) {
    super(`Cannot derive mailbox local part from agent id: ${agentId}`);
    this.name = 'MailboxLocalPartDerivationError';
    this.agentId = agentId;
  }
}

export class InvalidMailboxAddressError extends Error {
  readonly address: string;

  constructor(address: string) {
    super(`Invalid mailbox address: ${address}`);
    this.name = 'InvalidMailboxAddressError';
    this.address = address;
  }
}

export class MigaduCredentialsParseError extends Error {
  readonly agentId: string;
  readonly stage: 'decrypt' | 'json' | 'schema';

  constructor(agentId: string, stage: 'decrypt' | 'json' | 'schema', message: string) {
    super(message);
    this.name = 'MigaduCredentialsParseError';
    this.agentId = agentId;
    this.stage = stage;
  }
}
