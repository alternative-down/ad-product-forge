import { forgeDebug } from '@forge-runtime/core';
const MINIMAX_BASE_URL = 'https://api.minimax.io/v1';

export interface MiniMaxConfig {
  apiKey: string;
}
import { serializeError } from '../agents/agent-runner-error-formatting';

export interface MiniMaxError {
  code: string;
  message: string;
}

export interface MiniMaxResponse<T> {
  success: boolean;
  data?: T;
  error?: MiniMaxError;
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
              forgeDebug({
                scope: 'minimax',
                level: 'warn',
                message: 'Failed to parse MiniMax response',
                context: { error: String(serializeError(error)) },
              });
              return null;
            }
          })()
        : null;

      if (!response.ok) {
        return this.buildError(
          String(response.status),
          this.extractErrorMessage(
            body,
            rawBody,
            `MiniMax request failed with status ${response.status}`,
          ),
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
            (this.getString(baseResp.status_msg) ?? '') || 'MiniMax returned an error response',
          );
        }
      }

      if (typeof body.baseRespStatusCode === 'number' && body.baseRespStatusCode !== 0) {
        return this.buildError(
          String(body.baseRespStatusCode),
          (this.getString(body.baseRespStatusMsg) ?? '') || 'MiniMax returned an error response',
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

  private extractErrorMessage(body: MiniMaxJsonResponse | null, rawBody: string, fallback: string) {
    if (body == null) {
      return rawBody.trim() || fallback;
    }

    const baseResp = this.getObject(body.base_resp);
    if (baseResp) {
      const message = this.getString(baseResp.status_msg);
      if ((message ?? '') !== '') {
        return message;
      }
    }

    return (
      (this.getString(body.status_msg) ?? '') ||
      (this.getString(body.message) ?? '') ||
      (this.getString(body.error) ?? '') ||
      (rawBody.trim() ?? '') ||
      fallback
    );
  }

  private getObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private getString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private getNumber(value: unknown) {
    return typeof value === 'number' ? value : undefined;
  }

  async textToSpeech(input: {
    text: string;
    voiceSetting?: {
      voiceId: string;
      speed?: number;
      volume?: number;
      pitch?: number;
    };
    outputFormat?: 'mp3' | 'wav' | 'flac';
    languageBoost?: string;
    pronunciationToneReplacements?: string[];
  }): Promise<MiniMaxResponse<{ audioHex: string; audioFormat: string }>> {
    const body: Record<string, unknown> = {
      model: 'speech-02-hd',
      text: input.text,
    };

    if (input.voiceSetting) {
      const vs: Record<string, unknown> = { voice_id: input.voiceSetting.voiceId };
      vs.speed = input.voiceSetting.speed ?? 1;
      if (input.voiceSetting.volume !== undefined) vs.vol = input.voiceSetting.volume;
      if (input.voiceSetting.pitch !== undefined) vs.pitch = input.voiceSetting.pitch;
      body.voice_setting = vs;
    } else {
      body.voice_setting = { voice_id: 'Portuguese_CaptivatingStoryteller', speed: 1 };
    }

    if (input.outputFormat) {
      body.audio_setting = { format: input.outputFormat };
    }

    if ((input.languageBoost ?? '') !== '') {
      body.language_boost = input.languageBoost;
    }

    if (input.pronunciationToneReplacements) {
      body.pronunciation_dict = { tone: input.pronunciationToneReplacements };
    }

    const response = await this.requestJson('/v1/t2a_v2', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!response.success || !response.data) {
      return response as MiniMaxResponse<never>;
    }

    const audioHex = this.getString(this.getObject(response.data.data)?.audio);

    if (audioHex === undefined || audioHex === '') {
      return this.buildError('INVALID_RESPONSE', 'MiniMax TTS response missing audio data');
    }

    return {
      success: true,
      data: { audioHex, audioFormat: input.outputFormat ?? 'mp3' },
    };
  }

  async listVoices(type: string): Promise<
    MiniMaxResponse<{
      systemVoices: Array<{
        voiceId: string;
        voiceName?: string;
        description: string[];
        createdTime?: string;
      }>;
      voiceCloning: Array<{
        voiceId: string;
        voiceName?: string;
        description: string[];
        createdTime?: string;
      }>;
      voiceGeneration: Array<{
        voiceId: string;
        voiceName?: string;
        description: string[];
        createdTime?: string;
      }>;
    }>
  > {
    const response = await this.requestJson(`/v1/t2a/list_voices?type=${type}`, { method: 'GET' });

    if (!response.success || !response.data) {
      return response as MiniMaxResponse<never>;
    }

    const apiData = (response.data as MiniMaxJsonResponse | undefined)?.data as
      | Record<string, unknown>
      | undefined;

    if (apiData == null) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax list_voices response missing data');
    }

    const parseVoice = (
      v: unknown,
    ): {
      voiceId: string;
      voiceName?: string;
      description: string[];
      createdTime?: string;
    } | null => {
      const obj = this.getObject(v);
      if (obj == null) return null;
      const voiceId = this.getString(obj.voice_id);
      if (voiceId === undefined || voiceId === '') return null;
      const description = Array.isArray(obj.description)
        ? (obj.description.filter((x) => typeof x === 'string') as string[])
        : [];
      return {
        voiceId,
        voiceName: this.getString(obj.voice_name),
        description,
        createdTime: this.getString(obj.created_time),
      };
    };

    const parseList = (key: string) =>
      (Array.isArray(apiData[key]) ? apiData[key] : [])
        .map(parseVoice)
        .filter((v): v is NonNullable<typeof v> => v !== null);

    return {
      success: true,
      data: {
        systemVoices: parseList('system_voice'),
        voiceCloning: parseList('voice_cloning'),
        voiceGeneration: parseList('voice_generation'),
      },
    };
  }

  async generateImage(input: {
    prompt: string;
    model?: string;
    aspectRatio?: string;
    width?: number;
    height?: number;
    imageCount?: number;
    subjectReference?: Array<{ type?: string; imageFile: string }>;
  }): Promise<MiniMaxResponse<{ images: string[] }>> {
    const body: Record<string, unknown> = {
      model: input.model ?? 'image-01',
      prompt: input.prompt,
      response_format: 'base64',
    };
    if ((input.aspectRatio ?? '') !== '') body.aspect_ratio = input.aspectRatio;
    if ((input.width ?? 0) !== 0) body.width = input.width;
    if ((input.height ?? 0) !== 0) body.height = input.height;
    if ((input.imageCount ?? 0) !== 0) body.num_images = input.imageCount;
    if (input.subjectReference) {
      body.subject_reference = input.subjectReference.map((s) => ({
        type: s.type ?? 'image',
        image_file: s.imageFile,
      }));
    }

    const response = await this.requestJson('/v1/image_generation', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!response.success || !response.data) {
      return response as MiniMaxResponse<never>;
    }

    const images = this.getObject(response.data.data)?.image_base64;
    if (!Array.isArray(images) || images.length === 0) {
      return this.buildError(
        'INVALID_RESPONSE',
        'MiniMax image generation response missing images',
      );
    }

    return { success: true, data: { images } };
  }

  async createVideoGenerationTask(input: {
    prompt: string;
    model?: string;
    duration?: number;
    resolution?: string;
    firstFrameImage?: string;
    lastFrameImage?: string;
  }): Promise<MiniMaxResponse<{ taskId: string }>> {
    const body: Record<string, unknown> = {
      model: input.model ?? 'MiniMax-Hailuo-2.3',
      prompt: input.prompt,
      duration: input.duration ?? 6,
      resolution: input.resolution ?? '1080P',
    };
    if ((input.firstFrameImage ?? '') !== '') body.first_frame_image = input.firstFrameImage;
    if ((input.lastFrameImage ?? '') !== '') body.last_frame_image = input.lastFrameImage;

    const response = await this.requestJson('/v1/video_generation', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!response.success || !response.data) {
      return response as MiniMaxResponse<never>;
    }

    const taskId = this.getString(this.getObject(response.data.data)?.task_id);
    if (taskId === undefined || taskId === '') {
      return this.buildError(
        'INVALID_RESPONSE',
        'MiniMax video generation response missing task_id',
      );
    }

    return { success: true, data: { taskId } };
  }

  async queryVideoGeneration(taskId: string): Promise<
    MiniMaxResponse<{
      taskId: string;
      status: string;
      fileId?: string;
      failureReason?: string;
    }>
  > {
    const response = await this.requestJson('/v1/query/video_generation', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId }),
    });

    if (!response.success || !response.data) {
      return response as MiniMaxResponse<never>;
    }

    const d = this.getObject(response.data.data);
    if (d == null) {
      return this.buildError('INVALID_RESPONSE', 'MiniMax video query response missing data');
    }

    const outTaskId = this.getString(d.task_id);
    const status = this.getString(d.status);
    if (!outTaskId || !status) {
      return this.buildError(
        'INVALID_RESPONSE',
        'MiniMax video query response missing task_id or status',
      );
    }

    return {
      success: true,
      data: {
        taskId: outTaskId as string,
        status: status as string,
        fileId: this.getString(d.file_id),
        failureReason: this.getString(d.failure_reason) ?? this.getString(d.error_message),
      },
    };
  }

  async retrieveFile(fileId: string): Promise<
    MiniMaxResponse<{
      fileId: string;
      fileName?: string;
      downloadUrl?: string;
    }>
  > {
    const response = await this.requestJson('/v1/files/retrieve', {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId }),
    });

    if (!response.success || !response.data) {
      return response as MiniMaxResponse<never>;
    }

    const fileObj = this.getObject(response.data.data)?.file;
    const f = this.getObject(fileObj);
    if (f == null) {
      return this.buildError(
        'INVALID_RESPONSE',
        'MiniMax file retrieve response missing file object',
      );
    }

    const downloadUrl = this.getString(f.download_url);
    if (downloadUrl === undefined || downloadUrl === '') {
      return this.buildError(
        'INVALID_RESPONSE',
        'MiniMax file retrieve response missing download_url',
      );
    }

    return {
      success: true,
      data: {
        fileId,
        fileName: this.getString(f.filename),
        downloadUrl,
      },
    };
  }
}

export function createMiniMaxClient(apiKey?: string): MiniMaxClient {
  const key = (apiKey ?? '') !== '' ? apiKey : process.env.MINIMAX_API_KEY;

  if (key === undefined || key === '') {
    forgeDebug({
      scope: 'minimax',
      level: 'error',
      message: 'createMinimaxManager: MINIMAX_API_KEY not set',
    });
    throw new Error('MINIMAX_API_KEY environment variable is not set');
  }

  return new MiniMaxClient({ apiKey: key });
}

export function createMiniMaxManager(config: {
  integrations: ReturnType<
    typeof import('../system-integrations/store').createSystemIntegrationStore
  >;
}) {
  async function getClient() {
    const cfg = await config.integrations.getMinimaxConfig();

    if (cfg == null) {
      forgeDebug({
        scope: 'minimax',
        level: 'warn',
        message: 'getClient MiniMax integration not configured',
      });
      throw new Error('MiniMax integration is not configured');
    }

    return new MiniMaxClient({ apiKey: cfg.apiKey });
  }

  return {
    async textToSpeech(input: Parameters<MiniMaxClient['textToSpeech']>[0]) {
      return await getClient().then((c) => c.textToSpeech(input));
    },
    async listVoices(type: string) {
      return await getClient().then((c) => c.listVoices(type));
    },
    async generateImage(input: Parameters<MiniMaxClient['generateImage']>[0]) {
      return await getClient().then((c) => c.generateImage(input));
    },
    async createVideoGenerationTask(
      input: Parameters<MiniMaxClient['createVideoGenerationTask']>[0],
    ) {
      return await getClient().then((c) => c.createVideoGenerationTask(input));
    },
    async queryVideoGeneration(taskId: string) {
      return await getClient().then((c) => c.queryVideoGeneration(taskId));
    },
    async retrieveFile(fileId: string) {
      return await getClient().then((c) => c.retrieveFile(fileId));
    },
  };
}

export type MiniMaxManager = ReturnType<typeof createMiniMaxManager>;
