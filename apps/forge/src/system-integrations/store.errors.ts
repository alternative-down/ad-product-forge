/**
 * Typed Error subclasses for the system-integrations/store module (Pattern L, D52 #6502 batch 37).
 */
export class SystemIntegrationsUnknownProviderTypeError extends Error {
  readonly code = 'SYSTEM_INTEGRATIONS_UNKNOWN_PROVIDER_TYPE' as const;
  constructor() {
    super('Unknown integration provider type');
    this.name = 'SystemIntegrationsUnknownProviderTypeError';
  }
}
