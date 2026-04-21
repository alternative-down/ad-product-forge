export type ImageGenerationRequest = {
    prompt: string;
    model?: string;
    aspectRatio?: string;
    responseFormat?: 'base64';
    subjectReference?: Array<{
        type: 'character';
        imageFile: string;
    }>;
};
export type GeneratedImage = {
    mimeType: string;
    bytes: Uint8Array;
};
export type ImageGenerationResponse = {
    images: GeneratedImage[];
};
export interface ImageGenerationGateway {
    generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
}
