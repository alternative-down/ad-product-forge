import type {
  GeneratedImage,
  ImageGenerationGateway,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from '../gateways/image-generation.js';

type MiniMaxFetch = typeof fetch;

export type MiniMaxImageGenerationGatewayOptions = {
  apiKey: string;
  model?: string;
  baseURL?: string;
  fetch?: MiniMaxFetch;
};

type MiniMaxImageJsonResponse = {
  data?: {
    image_base64?: string[];
  };
};

export class MiniMaxImageGenerationGateway implements ImageGenerationGateway {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseURL: string;
  private readonly fetchImpl: MiniMaxFetch;

  constructor(options: MiniMaxImageGenerationGatewayOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'image-01';
    this.baseURL = options.baseURL ?? 'https://api.minimax.io';
    this.fetchImpl = options.fetch ?? fetch;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const response = await this.fetchImpl(`${this.baseURL}/v1/image_generation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model ?? this.model,
        prompt: request.prompt,
        aspect_ratio: request.aspectRatio ?? '1:1',
        response_format: request.responseFormat ?? 'base64',
        subject_reference: request.subjectReference?.map((reference) => ({
          type: reference.type,
          image_file: reference.imageFile,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`MiniMax image generation failed with status ${response.status}`);
    }

    const json = await response.json() as MiniMaxImageJsonResponse;
    const encodedImages = json.data?.image_base64 ?? [];

    return {
      images: encodedImages.map((image): GeneratedImage => ({
        mimeType: 'image/jpeg',
        bytes: Uint8Array.from(Buffer.from(image, 'base64')),
      })),
    };
  }
}

