/**
 * Typed Error subclasses for the github/apps module (Pattern L, D52 #6502 batch 25).
 *
 * Replaces 2 raw `throw new Error(...)` calls in github/apps.ts with 2 typed
 * Error subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/github/apps.ts collapse to 2 typed Error classes.
 * Message format is preserved verbatim for backward compatibility with
 * existing `.rejects.toThrow(<substring>)` tests in github/apps.test.ts:
 *   - L172 expects `'already has GitHub credentials'`.
 *
 * Pattern reference: apps/forge/src/communication/internal-chat-provider.errors.ts
 * (D52 batch 23 — Varek), apps/forge/src/finance/company-payables.errors.ts
 * (D52 batch 24 — Kaelen).
 */

export class AgentAlreadyHasGitHubCredentialsError extends Error {
  readonly code = 'AGENT_ALREADY_HAS_GITHUB_CREDENTIALS' as const;
  readonly agentId: string;

  constructor(agentId: string) {
    super(`Agent ${agentId} already has GitHub credentials`);
    this.name = 'AgentAlreadyHasGitHubCredentialsError';
    this.agentId = agentId;
  }
}

export class AgentMissingGitHubCredentialsToUpdateError extends Error {
  readonly code = 'AGENT_MISSING_GITHUB_CREDENTIALS_TO_UPDATE' as const;
  readonly agentId: string;

  constructor(agentId: string) {
    super(`Agent ${agentId} has no GitHub credentials to update`);
    this.name = 'AgentMissingGitHubCredentialsToUpdateError';
    this.agentId = agentId;
  }
}
