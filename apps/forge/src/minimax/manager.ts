/**
 * MiniMax API client for creative generation (TTS, Image, Video)
 * API Documentation: https://platform.minimax.io/docs/guides/models-intro
 */

const MINIMAX_BASE_URL = 'https://api.minimax.io';
const MINIMAX_API_VERSION = 'v1';

export interface MiniMaxConfig {
  apiKey: string;
  groupId?: string;
}

export interface TTSOptions {
  text: string;
  model?: string;
  voiceSetting?: {
    voiceId: string;
    speed?: number;
    volume?: number;
    pitch?: number;
  };
  outputFormat?: 'mp3' | 'wav' | 'flac';
}

export interface ImageOptions {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  imageCount?: number;
  style?: string;
}

export interface VideoOptions {
  prompt: string;
  model?: string;
  duration?: number;
  fsp?: number;
  petal_scale?: number;
}

export interface MiniMaxResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface TTSResponse {
  audio_file?: string;
  audio_id?: string;
  extra_info?: {
    tokens: number;
    duration_seconds: number;
  };
}

export interface ImageResponse {
  image_urls?: string[];
  base64_images?: string[];
  extra_info?: {
    image_count: number;
    processing_time_ms: number;
  };
}

export interface VideoResponse {
  task_id?: string;
  status?: string;
  video_url?: string;
  extra_info?: {
    duration_seconds: number;
    processing_time_ms: number;
  };
}

export class MiniMaxClient {
  private apiKey: string;
  private groupId: string;

  constructor(config: MiniMaxConfig) {
    this.apiKey = config.apiKey;
    this.groupId = config.groupId || '';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<MiniMaxResponse<T>> {
    const url = `${MINIMAX_BASE_URL}/${MINIMAX_API_VERSION}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    if (this.groupId) {
      headers['GroupId'] = this.groupId;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: String(response.status),
            message: data.message || data.error || 'Unknown error',
          },
        };
      }

      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network request failed',
        },
      };
    }
  }

  /**
   * Generate speech from text (TTS)
   * @see https://platform.minimax.io/docs/api-reference/speech-t2a-intro
   */
  async textToSpeech(options: TTSOptions): Promise<MiniMaxResponse<TTSResponse>> {
    const model = options.model || 'speech-02-turbo';
    const voiceId = options.voiceSetting?.voiceId || 'male-qn-qingse';

    const payload = {
      model,
      text: options.text,
      voice_setting: {
        voice_id: voiceId,
        speed: options.voiceSetting?.speed || 1.0,
        volume: options.voiceSetting?.volume || 1.0,
        pitch: options.voiceSetting?.pitch || 0,
      },
      audio_format: options.outputFormat || 'mp3',
      byte_size: 128000,
    };

    return this.request<TTSResponse>('/t2a_pro', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Generate images from text prompt
   * @see https://platform.minimax.io/docs/api-reference/image-generation-intro
   */
  async generateImage(options: ImageOptions): Promise<MiniMaxResponse<ImageResponse>> {
    const model = options.model || 'image-01';

    const payload = {
      model,
      prompt: options.prompt,
      num_images: options.imageCount || 1,
      width: options.width || 1024,
      height: options.height || 1024,
      style: options.style || '<auto>',
    };

    return this.request<ImageResponse>('/image', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Generate video from text prompt
   * @see https://platform.minimax.io/docs/api-reference/video-generation-intro
   */
  async generateVideo(options: VideoOptions): Promise<MiniMaxResponse<VideoResponse>> {
    const model = options.model || 'video-01-live-2.0';

    const payload = {
      model,
      prompt: options.prompt,
      duration: options.duration || 6,
      fsp: options.fsp || 25,
      petal_scale: options.petal_scale || 1.0,
    };

    return this.request<VideoResponse>('/video', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

/**
 * Create a MiniMax client with API key from environment
 */
export function createMiniMaxClient(apiKey?: string): MiniMaxClient {
  const key = apiKey || process.env.MINIMAX_API_KEY;

  if (!key) {
    throw new Error('MINIMAX_API_KEY environment variable is not set');
  }

  return new MiniMaxClient({
    apiKey: key,
    groupId: process.env.MINIMAX_GROUP_ID,
  });
}
