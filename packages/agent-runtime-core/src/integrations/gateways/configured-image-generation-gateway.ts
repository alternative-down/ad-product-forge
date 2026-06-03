import type {
  ImageGenerationGateway,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from './image-generation.js';

export type ConfiguredImageGenerationGatewayOptions = {
  base: ImageGenerationGateway;
  model?: string;
  aspectRatio?: string;
  responseFormat?: 'base64';
};

export class ConfiguredImageGenerationGateway implements ImageGenerationGateway {
  private readonly base: ImageGenerationGateway;
  private readonly model: string | undefined;
  private readonly aspectRatio: string | undefined;
  private readonly responseFormat: 'base64' | undefined;

  constructor(options: ConfiguredImageGenerationGatewayOptions) {
    this.base = options.base;
    this.model = options.model;
    this.aspectRatio = options.aspectRatio;
    this.responseFormat = options.responseFormat;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    return await this.base.generate({
      ...request,
      model: request.model ?? this.model,
      aspectRatio: request.aspectRatio ?? this.aspectRatio,
      responseFormat: request.responseFormat ?? this.responseFormat,
    });
  }
}
