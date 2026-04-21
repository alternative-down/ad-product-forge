import type { ProviderHeaders, StepModelProviderConfig, StepModelProviderGateway } from './providers.js';
export type ConfiguredProviderGatewayOptions = {
    base: StepModelProviderGateway;
    headers?: ProviderHeaders;
    headersByProvider?: Record<string, ProviderHeaders>;
    defaultTemperature?: number;
};
export declare class ConfiguredProviderGateway implements StepModelProviderGateway {
    private readonly base;
    private readonly headers;
    private readonly headersByProvider;
    private readonly defaultTemperature;
    constructor(options: ConfiguredProviderGatewayOptions);
    createStepModel(config: StepModelProviderConfig): Promise<import("../index.js").StepModelAdapter>;
}
