const MINIMAX_BASE_URL = 'https://api.minimax.io/v1';

export interface MiniMaxConfig {
  apiKey: string;
}

export interface TTSOptions {
  text: string;
  voiceSetting?: {
    voiceId: string;
    speed?: number;
    volume?: number;
    pitch?: number;
  };
  languageBoost?: string;
  pronunciationToneReplacements?: string[];
  outputFormat?: 'mp3' | 'wav' | 'flac';
}

export interface ImageOptions {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  imageCount?: number;
  subjectReference?: Array<{
    type: string;
    imageFile: string;
  }>;
}

export interface VideoOptions {
  prompt: string;
  model?: string;
  duration?: number;
  resolution?: '768P' | '1080P';
  firstFrameImage?: string;
  lastFrameImage?: string;
}

export interface MiniMaxError {
  code: string;
  message: string;
}

export interface MiniMaxResponse<T> {
  success: boolean;
  data?: T;
  error?: MiniMaxError;
}

export interface TTSResponse {
  audioHex: string;
  audioFormat: 'mp3' | 'wav' | 'flac';
}

export interface ImageResponse {
  images: string[];
}

export interface VideoTaskResponse {
  taskId: string;
}

export interface VideoStatusResponse {
  taskId: string;
  status: string;
  fileId?: string;
  failureReason?: string;
}

export interface FileRetrieveResponse {
  fileId: string;
  fileName?: string;
  downloadUrl: string;
}

export interface MiniMaxVoice {
  voiceId: string;
  voiceName?: string;
  description: string[];
  createdTime?: string;
}

export interface VoiceListResponse {
  systemVoices: MiniMaxVoice[];
  voiceCloning: MiniMaxVoice[];
  voiceGeneration: MiniMaxVoice[];
}

type MiniMaxJsonResponse = Record<string, unknown>;

export class MiniMaxClient {
  private readonly apiKey: string;

  constructor(config: MiniMaxConfig) {
    this.apiKey = config.apiKey;
  }

  private buildError(code: string, message: string): MiniMaxResponse<never> {
    return {
      success: false,
      error: { code, message },
    };
  }

  private async requestJson(
    endpoint: string,
    init: RequestInit,
  ): Promise<MiniMaxResponse<MiniMaxJsonResponse>> {
    try {
      const response = await fetch(`${MINIMAX_BASE_URL}${endpoint}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      const rawBody = await response.text();
      const body = rawBody.trim()
        ? (() => {
            try {
              return JSON.parse(rawBody) as MiniMaxJsonResponse;
            } catch (error) {
              forgeDebug({ scope: 'minimax/manager', level: 'warn', message: 'Failed to parse MiniMax response', context: { error } });
              return null;
            }
          })()
        : {};

      if (!response.ok) {
        return this.buildError(
          String(response.status),
          this.extractErrorMessage(body, rawBody, `MiniMax request failed with status ${response.status}`),
        );
      }

      if (!body || Array.isArray(body)) {
        return this.buildError(
          'INVALID_RESPONSE',
          `MiniMax returned an invalid JSON payload for ${endpoint}`,
        );
      }

      const baseResp = this.getObject(body.base_resp);

      if (baseResp) {
        const statusCode = this.getNumber(baseResp.status_code);
        if (statusCode !== undefined && statusCode !== 0) {
          return this.buildError(
            String(statusCode),
            this.getString(baseResp.status_msg) || 'MiniMax returned an error response',
          );
        }
      }

      if (typeof body.baseRespStatusCode === 'number' && body.baseRespStatusCode !== 0) {
        return this.buildError(
          String(body.baseRespStatusCode),
          this.getString(body.baseRespStatusMsg) || 'MiniMax returned an error response',
        );
      }

      return {
        success: true,
        data: body,
      };
    } catch (error) {
      return this.buildError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Network request failed',
      );
    }
  }

  private extractErrorMessage(
    body: MiniMaxJsonResponse | null,
    rawBody: string,
    fallback: string,
  ) {
    if (!body) {
      return rawBody.trim() || fallback;
    }

    const baseResp = this.getObject(body.base_resp);
    if (baseResp) {
      const message = this.getString(baseResp.status_msg);
      if (message) {
        return message;
      }
    }

    return (
      this.getString(body.status_msg) ||
      this.getString(body.message) ||
      this.getString(body.error) ||
      rawBody.trim() ||
      fallback
    );
  }

  private getObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private getString(value: unknown) {
    return typeof value === 'string' ? value : undefined;
  }

  private getNumber(value: unknown) {
    return typeof value === 'number' ? value : undefined;
  }

  async textToSpeech(options: TTSOptions): Promise<MiniMaxResponse<TTSResponse>> {
    const response = await this.requestJson('/t2a_v2', {
      method: 'POST',
      body: JSON.stringify({
        model: 'speech-2.8-hd',
        text: options.text,
        stream: false,
        language_boost: options.languageBoost,
        output_format: 'hex',
        voice_setting: {
          voice_id: options.voiceSetting?.voiceId ?? 'Portuguese_CaptivatingStoryteller',
          speed: options.voiceSetting?.speed ?? 1,
          vol: options.voiceSetting?.volume ?? 1,
          pitch: options.voiceSetting?.pitch ?? 0,
        },
        pronunciation_dict: options.pronunciationToneReplacements
          ? {
              tone: options.pronunciationToneReplacements,
            }
          : undefined,
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: options.outputFormat ?? 'mp3',
          channel: 1,
        },
      }),
    });

    if (!response.success) {
      return {
        success: false,
        error: response.error,
      };
    }

    const data = response.data;
    if (!data) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax did not return synthesized audio data.');
    }

    const responseData = this.getObject(data.data);
    const audio = responseData ? this.getString(responseData.audio) : undefined;
    if (!audio) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax did not return synthesized audio data.');
    }

    return {
      success: true,
      data: {
        audioHex: audio,
        audioFormat: options.outputFormat ?? 'mp3',
      },
    };
  }

  async listVoices(voiceType: 'system' | 'voice_cloning' | 'voice_generation' | 'all'): Promise<MiniMaxResponse<VoiceListResponse>> {
    const response = await this.requestJson('/get_voice', {
      method: 'POST',
      body: JSON.stringify({
        voice_type: voiceType,
      }),
    });

    if (!response.success) {
      return {
        success: false,
        error: response.error,
      };
    }

    const data = response.data;

    if (!data) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax did not return any voice information.');
    }

    const parseVoices = (value: unknown): MiniMaxVoice[] => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value.flatMap((item) => {
        const record = this.getObject(item);

        if (!record) {
          return [];
        }

        const voiceId = this.getString(record.voice_id);

        if (!voiceId) {
          return [];
        }

        const description = Array.isArray(record.description)
          ? record.description.flatMap((entry) => {
              const text = this.getString(entry);
              return text ? [text] : [];
            })
          : [];

        return [{
          voiceId,
          voiceName: this.getString(record.voice_name),
          description,
          createdTime: this.getString(record.created_time),
        }];
      });
    };

    return {
      success: true,
      data: {
        systemVoices: parseVoices(data.system_voice),
        voiceCloning: parseVoices(data.voice_cloning),
        voiceGeneration: parseVoices(data.voice_generation),
      },
    };
  }

  async generateImage(options: ImageOptions): Promise<MiniMaxResponse<ImageResponse>> {
    const payload: Record<string, unknown> = {
      model: options.model ?? 'image-01',
      prompt: options.prompt,
      response_format: 'base64',
      n: options.imageCount ?? 1,
    };

    if (options.aspectRatio) {
      payload.aspect_ratio = options.aspectRatio;
    }

    if (options.width && options.height) {
      payload.width = options.width;
      payload.height = options.height;
    }

    if (options.subjectReference && options.subjectReference.length > 0) {
      payload.subject_reference = options.subjectReference.map((reference) => ({
        type: reference.type,
        image_file: reference.imageFile,
      }));
    }

    const response = await this.requestJson('/image_generation', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response.success) {
      return {
        success: false,
        error: response.error,
      };
    }

    const data = response.data;
    if (!data) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax did not return any generated images.');
    }

    const responseData = this.getObject(data.data);
    const imageBase64 = responseData ? responseData.image_base64 : undefined;
    const images = Array.isArray(imageBase64)
      ? imageBase64.flatMap((item) => {
          const base64 = this.getString(item);
          return base64 ? [base64] : [];
        })
      : [];

    if (images.length === 0) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax did not return any generated images.');
    }

    return {
      success: true,
      data: { images },
    };
  }

  async createVideoGenerationTask(
    options: VideoOptions,
  ): Promise<MiniMaxResponse<VideoTaskResponse>> {
    const payload: Record<string, unknown> = {
      model: options.model ?? 'MiniMax-Hailuo-2.3',
      prompt: options.prompt,
      duration: options.duration ?? 6,
      resolution: options.resolution ?? '1080P',
    };

    if (options.firstFrameImage) {
      payload.first_frame_image = options.firstFrameImage;
    }

    if (options.lastFrameImage) {
      payload.last_frame_image = options.lastFrameImage;
    }

    const response = await this.requestJson('/video_generation', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response.success) {
      return {
        success: false,
        error: response.error,
      };
    }

    const data = response.data;
    if (!data) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax did not return a video task id.');
    }

    const taskId = this.getString(data.task_id);
    if (!taskId) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax did not return a video task id.');
    }

    return {
      success: true,
      data: { taskId },
    };
  }

  async queryVideoGeneration(
    taskId: string,
  ): Promise<MiniMaxResponse<VideoStatusResponse>> {
    const response = await this.requestJson(
      `/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
      { method: 'GET' },
    );

    if (!response.success) {
      return {
        success: false,
        error: response.error,
      };
    }

    const data = response.data;
    if (!data) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax did not return a video task status.');
    }

    return {
      success: true,
      data: {
        taskId: this.getString(data.task_id) ?? taskId,
        status: this.getString(data.status) ?? 'Unknown',
        fileId: this.getString(data.file_id),
        failureReason: this.getString(data.failure_reason) ?? this.getString(data.error_message),
      },
    };
  }

  async retrieveFile(fileId: string): Promise<MiniMaxResponse<FileRetrieveResponse>> {
    const response = await this.requestJson(
      `/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
      { method: 'GET' },
    );

    if (!response.success) {
      return {
        success: false,
        error: response.error,
      };
    }

    const data = response.data;
    if (!data) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax did not return file metadata.');
    }

    const file = this.getObject(data.file);
    const downloadUrl = file ? this.getString(file.download_url) : undefined;

    if (!downloadUrl) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax did not return a download URL for the generated file.');
    }

    return {
      success: true,
      data: {
        fileId: fileId,
        fileName: file ? this.getString(file.filename) : undefined,
        downloadUrl,
      },
    };
  }
}

export function createMiniMaxClient(apiKey?: string): MiniMaxClient {
  const key = apiKey || process.env.MINIMAX_API_KEY;

  if (!key) {
    throw new Error('MINIMAX_API_KEY environment variable is not set');
  }

  return new MiniMaxClient({ apiKey: key });
}

export function createMiniMaxManager(config: {
  integrations: ReturnType<typeof import('../system-integrations/store').createSystemIntegrationStore>;
}) {
  async function getClient() {
    const cfg = await config.integrations.getMinimaxConfig();

    if (!cfg) {
      throw new Error('MiniMax integration is not configured');
    }

    return new MiniMaxClient({ apiKey: cfg.apiKey });
  }

  async function textToSpeech(options: TTSOptions) {
    return (await getClient()).textToSpeech(options);
  }

  async function generateImage(options: ImageOptions) {
    return (await getClient()).generateImage(options);
  }

  async function listVoices(voiceType: 'system' | 'voice_cloning' | 'voice_generation' | 'all') {
    return (await getClient()).listVoices(voiceType);
  }

  async function createVideoGenerationTask(options: VideoOptions) {
    return (await getClient()).createVideoGenerationTask(options);
  }

  async function queryVideoGeneration(taskId: string) {
    return (await getClient()).queryVideoGeneration(taskId);
  }

  async function retrieveFile(fileId: string) {
    return (await getClient()).retrieveFile(fileId);
  }

  return {
    textToSpeech,
    listVoices,
    generateImage,
    createVideoGenerationTask,
    queryVideoGeneration,
    retrieveFile,
  };
}

export type MiniMaxManager = ReturnType<typeof createMiniMaxManager>;
