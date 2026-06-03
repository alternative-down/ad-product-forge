import { generateText, type LanguageModel } from 'ai';

import type { VisionGateway, VisionRequest, VisionResponse } from './vision.js';

export type AiSdkVisionGatewayOptions = {
  model: LanguageModel;
  system?: string;
  temperature?: number;
};

export class AiSdkVisionGateway implements VisionGateway {
  private readonly model: LanguageModel;
  private readonly system: string | undefined;
  private readonly temperature: number | undefined;

  constructor(options: AiSdkVisionGatewayOptions) {
    this.model = options.model;
    this.system = options.system;
    this.temperature = options.temperature;
  }

  async analyze(request: VisionRequest): Promise<VisionResponse> {
    const content = [];

    if (request.prompt != null && request.prompt.trim().length > 0) {
      content.push({
        type: 'text' as const,
        text: request.prompt.trim(),
      });
    }

    for (const image of request.images) {
      content.push({
        type: 'image' as const,
        image: toDataUrl(image.mimeType, image.bytes),
      });
    }

    const result = await generateText({
      model: this.model,
      system: this.system,
      temperature: this.temperature,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      experimental_include: {
        requestBody: false,
        responseBody: false,
      },
    });

    return {
      text: result.text.trim(),
    };
  }
}

function toDataUrl(mimeType: string, bytes: Uint8Array) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}
