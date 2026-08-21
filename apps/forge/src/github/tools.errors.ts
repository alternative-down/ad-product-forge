/**
 * Typed Error subclasses for the github/tools module (Pattern L, D52 #6502 batch 37).
 */
export class GitHubIntegrationNotConfiguredError extends Error {
  readonly code = 'GITHUB_INTEGRATION_NOT_CONFIGURED' as const;
  constructor() {
    super('GitHub integration is not configured at the platform level.');
    this.name = 'GitHubIntegrationNotConfiguredError';
  }
}
