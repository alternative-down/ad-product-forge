import type { StepModelProviderConfig, StepModelProviderGateway } from './providers.js';
export type FallbackProviderGatewayOptions = {
    gateways: StepModelProviderGateway[];
};
export declare class FallbackProviderGateway implements StepModelProviderGateway {
    private readonly gateways;
    constructor(options: FallbackProviderGatewayOptions);
    createStepModel(config: StepModelProviderConfig): Promise<import("../index.js").StepModelAdapter>;
}
