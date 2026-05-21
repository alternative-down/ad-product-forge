import type { VisionGateway, VisionRequest, VisionResponse } from './vision.js';

export type ConfiguredVisionGatewayOptions = {
  base: VisionGateway;
  headers?: Record<string, string>;
};

export class ConfiguredVisionGateway implements VisionGateway {
  private readonly base: VisionGateway;
  private readonly headers: Record<string, string>;

  constructor(options: ConfiguredVisionGatewayOptions) {
    this.base = options.base;
    this.headers = options.headers ?? {};
  }

  async analyze(request: VisionRequest): Promise<VisionResponse> {
    return this.base.analyze({
      ...request,
      headers: {
        ...this.headers,
        ...(request.headers ?? {}),
      },
    });
  }
}
