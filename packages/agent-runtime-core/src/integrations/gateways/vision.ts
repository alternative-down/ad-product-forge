export type VisionImageInput = {
  mimeType: string;
  bytes: Uint8Array;
};

export type VisionRequest = {
  prompt?: string;
  images: VisionImageInput[];
  headers?: Record<string, string>;
};

export type VisionResponse = {
  text: string;
};

export interface VisionGateway {
  analyze(request: VisionRequest): Promise<VisionResponse>;
}
