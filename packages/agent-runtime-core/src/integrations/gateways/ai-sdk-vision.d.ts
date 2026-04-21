import { type LanguageModel } from 'ai';
import type { VisionGateway, VisionRequest, VisionResponse } from './vision.js';
export type AiSdkVisionGatewayOptions = {
    model: LanguageModel;
    system?: string;
    temperature?: number;
};
export declare class AiSdkVisionGateway implements VisionGateway {
    private readonly model;
    private readonly system;
    private readonly temperature;
    constructor(options: AiSdkVisionGatewayOptions);
    analyze(request: VisionRequest): Promise<VisionResponse>;
}
