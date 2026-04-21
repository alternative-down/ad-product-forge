import type { ImageGenerationGateway, ImageGenerationRequest, ImageGenerationResponse } from './image-generation.js';
export type ConfiguredImageGenerationGatewayOptions = {
    base: ImageGenerationGateway;
    model?: string;
    aspectRatio?: string;
    responseFormat?: 'base64';
};
export declare class ConfiguredImageGenerationGateway implements ImageGenerationGateway {
    private readonly base;
    private readonly model;
    private readonly aspectRatio;
    private readonly responseFormat;
    constructor(options: ConfiguredImageGenerationGatewayOptions);
    generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
}
