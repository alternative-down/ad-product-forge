import type { ImageGenerationGateway, ImageGenerationRequest, ImageGenerationResponse } from '../gateways/image-generation.js';
type MiniMaxFetch = typeof fetch;
export type MiniMaxImageGenerationGatewayOptions = {
    apiKey: string;
    model?: string;
    baseURL?: string;
    fetch?: MiniMaxFetch;
};
export declare class MiniMaxImageGenerationGateway implements ImageGenerationGateway {
    private readonly apiKey;
    private readonly model;
    private readonly baseURL;
    private readonly fetchImpl;
    constructor(options: MiniMaxImageGenerationGatewayOptions);
    generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
}
export {};
