/**
 * Typed Error subclasses for the github/ops/credentials module (Pattern L, D52 #6502 batch 37).
 */
export class GitHubAppNotActiveError extends Error {
  readonly code = 'GITHUB_APP_NOT_ACTIVE' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`GitHub App not active for agent ${agentId}`);
    this.name = 'GitHubAppNotActiveError';
    this.agentId = agentId;
  }
}
