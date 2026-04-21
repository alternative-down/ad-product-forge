import type { VisionGateway, VisionRequest, VisionResponse } from './vision.js';
export type ConfiguredVisionGatewayOptions = {
    base: VisionGateway;
    headers?: Record<string, string>;
};
export declare class ConfiguredVisionGateway implements VisionGateway {
    private readonly base;
    private readonly headers;
    constructor(options: ConfiguredVisionGatewayOptions);
    analyze(request: VisionRequest): Promise<VisionResponse>;
}
