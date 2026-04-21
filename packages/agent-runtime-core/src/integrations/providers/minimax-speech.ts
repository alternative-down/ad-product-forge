import type {
  TextToSpeechGateway,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from '../gateways/speech.js';

type MiniMaxFetch = typeof fetch;

export type MiniMaxTextToSpeechGatewayOptions = {
  apiKey: string;
  model?: string;
  voiceId?: string;
  baseURL?: string;
  fetch?: MiniMaxFetch;
};

type MiniMaxTtsJsonResponse = {
  data?: {
    audio?: string;
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
};

export class MiniMaxTextToSpeechGateway implements TextToSpeechGateway {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly voiceId: string;
  private readonly baseURL: string;
  private readonly fetchImpl: MiniMaxFetch;

  constructor(options: MiniMaxTextToSpeechGatewayOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'speech-2.8-hd';
    this.voiceId = options.voiceId ?? 'English_expressive_narrator';
    this.baseURL = options.baseURL ?? 'https://api.minimax.io';
    this.fetchImpl = options.fetch ?? fetch;
  }

  async synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResponse> {
    const response = await this.fetchImpl(`${this.baseURL}/v1/t2a_v2`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...request.headers,
      },
      body: JSON.stringify({
        model: this.model,
        text: request.text,
        stream: false,
        voice_setting: {
          voice_id: request.voiceId ?? this.voiceId,
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          format: 'mp3',
          sample_rate: 32000,
          bitrate: 128000,
          channel: 1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`MiniMax TTS request failed with status ${response.status}`);
    }

    const json = await response.json() as MiniMaxTtsJsonResponse;
    const audioHex = json.data?.audio;

    if (!audioHex) {
      throw new Error(
        `MiniMax TTS returned no audio: ${json.base_resp?.status_msg ?? 'unknown error'}`,
      );
    }

    return {
      mimeType: 'audio/mpeg',
      bytes: Uint8Array.from(Buffer.from(audioHex, 'hex')),
    };
  }
}
