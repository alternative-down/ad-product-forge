/**
 * Typed Error subclasses for the forge-bootstrap module
 * (Pattern L, D52 #6502 batch 39).
 */
export class ForgeAdminApiKeyNotConfiguredError extends Error {
  readonly code = 'FORGE_ADMIN_API_KEY_NOT_CONFIGURED' as const;
  constructor() {
    super(
      'FORGE_ADMIN_API_KEY is not configured. Set it in your environment or set' +
        ' FORGE_ADMIN_ALLOW_INSECURE_LOCAL=true for local development only.'
    );
    this.name = 'ForgeAdminApiKeyNotConfiguredError';
  }
}
