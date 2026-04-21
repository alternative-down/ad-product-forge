import type { StepModelProviderConfig, StepModelProviderGateway } from './providers.js';

export type FallbackProviderGatewayOptions = {
  gateways: StepModelProviderGateway[];
};

export class FallbackProviderGateway implements StepModelProviderGateway {
  private readonly gateways: StepModelProviderGateway[];

  constructor(options: FallbackProviderGatewayOptions) {
    this.gateways = options.gateways;
  }

  async createStepModel(config: StepModelProviderConfig) {
    if (this.gateways.length === 0) {
      throw new Error('FallbackProviderGateway requires at least one gateway');
    }

    const errors: string[] = [];

    for (const gateway of this.gateways) {
      try {
        return await gateway.createStepModel(config);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(`All provider gateways failed for ${config.modelId}: ${errors.join(' | ')}`);
  }
}
