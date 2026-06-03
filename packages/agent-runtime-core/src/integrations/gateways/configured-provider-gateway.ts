import type {
  ProviderHeaders,
  StepModelProviderConfig,
  StepModelProviderGateway,
} from './providers.js';
import { splitProviderModelId as splitModelId } from './providers.js';

export type ConfiguredProviderGatewayOptions = {
  base: StepModelProviderGateway;
  headers?: ProviderHeaders;
  headersByProvider?: Record<string, ProviderHeaders>;
  defaultTemperature?: number;
};

export class ConfiguredProviderGateway implements StepModelProviderGateway {
  private readonly base: StepModelProviderGateway;
  private readonly headers: ProviderHeaders;
  private readonly headersByProvider: Record<string, ProviderHeaders>;
  private readonly defaultTemperature: number | undefined;

  constructor(options: ConfiguredProviderGatewayOptions) {
    this.base = options.base;
    this.headers = options.headers ?? {};
    this.headersByProvider = options.headersByProvider ?? {};
    this.defaultTemperature = options.defaultTemperature;
  }

  async createStepModel(config: StepModelProviderConfig) {
    const { providerId } = splitModelId(config.modelId);
    const scopedHeaders = providerId != null ? (this.headersByProvider[providerId] ?? {}) : {};

    return await this.base.createStepModel({
      ...config,
      headers: {
        ...this.headers,
        ...scopedHeaders,
        ...(config.headers ?? {}),
      },
      temperature: config.temperature ?? this.defaultTemperature,
    });
  }
}
