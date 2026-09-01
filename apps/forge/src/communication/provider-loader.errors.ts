/**
 * Typed Error subclasses for the communication/provider-loader module (Pattern L, D52 #6502 batch 36).
 */
export class CommunicationProviderMissingServiceError extends Error {
  readonly code = 'COMMUNICATION_PROVIDER_MISSING_SERVICE' as const;
  constructor() {
    super('Internal chat provider requires the internalChat service');
    this.name = 'CommunicationProviderMissingServiceError';
  }
}
