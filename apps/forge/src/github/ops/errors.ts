/**
 * Typed Error subclasses for the github/ops/app-lifecycle module (Pattern L, D51 #6502 batch 20).
 *
 * Replaces 3 raw `throw new Error(...)` calls in app-lifecycle.ts with 3 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 3 literal `throw new Error(...)` calls in
 * apps/forge/src/github/ops/app-lifecycle.ts collapse to 3 typed Error classes.
 * Message format is preserved verbatim for backward compatibility with
 * existing test substrings and #6015 L#NN-46 transaction semantics.
 *
 * Pattern reference: apps/forge/src/finance/payment-providers/errors.ts (D51
 * batch 19 — Aldric), apps/forge/src/admin/routes/errors.ts (D51 batch 17 —
 * Aldric), apps/forge/src/finance/payment-receivables.errors.ts (D51 batch 14 —
 * Varek).
 */

export class GithubIntegrationNotConfiguredError extends Error {
  readonly code = 'GITHUB_INTEGRATION_NOT_CONFIGURED' as const;
  constructor() {
    super('GitHub integration is not configured');
    this.name = 'GithubIntegrationNotConfiguredError';
  }
}

export class GithubAppAlreadyExistsError extends Error {
  readonly code = 'GITHUB_APP_ALREADY_EXISTS' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`GitHub App already exists for agent ${agentId}`);
    this.name = 'GithubAppAlreadyExistsError';
    this.agentId = agentId;
  }
}

export class GithubAppDoesNotExistError extends Error {
  readonly code = 'GITHUB_APP_DOES_NOT_EXIST' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`GitHub App does not exist for agent ${agentId}`);
    this.name = 'GithubAppDoesNotExistError';
    this.agentId = agentId;
  }
}
