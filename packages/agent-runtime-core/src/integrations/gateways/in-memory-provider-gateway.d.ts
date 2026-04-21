import type { StepModelAdapter } from '../../core/model.js';
import type { StepModelProviderConfig, StepModelProviderGateway } from './providers.js';
export type ProviderFactory = (config: StepModelProviderConfig) => Promise<StepModelAdapter> | StepModelAdapter;
export declare class InMemoryProviderGateway implements StepModelProviderGateway {
    private readonly factories;
    register(providerId: string, factory: ProviderFactory): void;
    createStepModel(config: StepModelProviderConfig): Promise<StepModelAdapter>;
}
