import type { StepModelAdapter } from '../../core/model.js';
import type { StepModelProviderConfig, StepModelProviderGateway } from './providers.js';

export type ProviderFactory = (
  config: StepModelProviderConfig,
) => Promise<StepModelAdapter> | StepModelAdapter;

export class InMemoryProviderGateway implements StepModelProviderGateway {
  private readonly factories = new Map<string, ProviderFactory>();

  register(providerId: string, factory: ProviderFactory) {
    this.factories.set(providerId, factory);
  }

  async createStepModel(config: StepModelProviderConfig): Promise<StepModelAdapter> {
    const providerId = extractProviderId(config.modelId);
    const factory = this.factories.get(providerId);

    if (!factory) {
      throw new Error(`No provider factory registered for ${providerId}`);
    }

    return await factory(config);
  }
}

function extractProviderId(modelId: string) {
  const [providerId] = modelId.split(':');

  if (!providerId) {
    throw new Error(`Could not infer provider id from model id ${modelId}`);
  }

  return providerId;
}
