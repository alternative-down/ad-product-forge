import type {
  RealtimeSpeechSynthesisAudioEvent,
  RealtimeTextToSpeechGateway,
  RealtimeTextToSpeechSession,
  RealtimeTranscriptionEvent,
  RealtimeSpeechToTextGateway,
  RealtimeSpeechToTextSession,
  SpeechToTextGateway,
  SpeechToTextRequest,
  SpeechToTextResponse,
  StreamingTextToSpeechGateway,
  StreamingTextToSpeechResponse,
  TextToSpeechGateway,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from './speech.js';

export type ConfiguredTextToSpeechGatewayOptions = {
  base: TextToSpeechGateway;
  voiceId?: string;
  headers?: Record<string, string>;
};

export class ConfiguredTextToSpeechGateway implements TextToSpeechGateway {
  private readonly base: TextToSpeechGateway;
  private readonly voiceId: string | undefined;
  private readonly headers: Record<string, string>;

  constructor(options: ConfiguredTextToSpeechGatewayOptions) {
    this.base = options.base;
    this.voiceId = options.voiceId;
    this.headers = options.headers ?? {};
  }

  async synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResponse> {
    return await this.base.synthesize({
      ...request,
      voiceId: request.voiceId ?? this.voiceId,
      headers: {
        ...this.headers,
        ...(request.headers ?? {}),
      },
    });
  }
}

export type ConfiguredStreamingTextToSpeechGatewayOptions = {
  base: StreamingTextToSpeechGateway;
  voiceId?: string;
  headers?: Record<string, string>;
};

export class ConfiguredStreamingTextToSpeechGateway implements StreamingTextToSpeechGateway {
  private readonly base: StreamingTextToSpeechGateway;
  private readonly voiceId: string | undefined;
  private readonly headers: Record<string, string>;

  constructor(options: ConfiguredStreamingTextToSpeechGatewayOptions) {
    this.base = options.base;
    this.voiceId = options.voiceId;
    this.headers = options.headers ?? {};
  }

  async synthesizeStream(request: TextToSpeechRequest): Promise<StreamingTextToSpeechResponse> {
    return await this.base.synthesizeStream({
      ...request,
      voiceId: request.voiceId ?? this.voiceId,
      headers: {
        ...this.headers,
        ...(request.headers ?? {}),
      },
    });
  }
}

export type ConfiguredRealtimeTextToSpeechGatewayOptions = {
  base: RealtimeTextToSpeechGateway;
  voiceId?: string;
  headers?: Record<string, string>;
};

export class ConfiguredRealtimeTextToSpeechGateway implements RealtimeTextToSpeechGateway {
  private readonly base: RealtimeTextToSpeechGateway;
  private readonly voiceId: string | undefined;
  private readonly headers: Record<string, string>;

  constructor(options: ConfiguredRealtimeTextToSpeechGatewayOptions) {
    this.base = options.base;
    this.voiceId = options.voiceId;
    this.headers = options.headers ?? {};
  }

  async createSession(
    options: {
      voiceId?: string;
      headers?: Record<string, string>;
      onAudioChunk?(event: RealtimeSpeechSynthesisAudioEvent): Promise<void> | void;
    } = {},
  ): Promise<RealtimeTextToSpeechSession> {
    return await this.base.createSession({
      ...options,
      voiceId: options.voiceId ?? this.voiceId,
      headers: {
        ...this.headers,
        ...(options.headers ?? {}),
      },
    });
  }
}

export type ConfiguredSpeechToTextGatewayOptions = {
  base: SpeechToTextGateway;
  language?: string;
  headers?: Record<string, string>;
};

export class ConfiguredSpeechToTextGateway implements SpeechToTextGateway {
  private readonly base: SpeechToTextGateway;
  private readonly language: string | undefined;
  private readonly headers: Record<string, string>;

  constructor(options: ConfiguredSpeechToTextGatewayOptions) {
    this.base = options.base;
    this.language = options.language;
    this.headers = options.headers ?? {};
  }

  async transcribe(request: SpeechToTextRequest): Promise<SpeechToTextResponse> {
    return await this.base.transcribe({
      ...request,
      language: request.language ?? this.language,
      headers: {
        ...this.headers,
        ...(request.headers ?? {}),
      },
    });
  }
}

export type ConfiguredRealtimeSpeechToTextGatewayOptions = {
  base: RealtimeSpeechToTextGateway;
  language?: string;
  headers?: Record<string, string>;
};

export class ConfiguredRealtimeSpeechToTextGateway implements RealtimeSpeechToTextGateway {
  private readonly base: RealtimeSpeechToTextGateway;
  private readonly language: string | undefined;
  private readonly headers: Record<string, string>;

  constructor(options: ConfiguredRealtimeSpeechToTextGatewayOptions) {
    this.base = options.base;
    this.language = options.language;
    this.headers = options.headers ?? {};
  }

  async createSession(
    options: {
      language?: string;
      headers?: Record<string, string>;
      onTranscription?(event: RealtimeTranscriptionEvent): Promise<void> | void;
    } = {},
  ): Promise<RealtimeSpeechToTextSession> {
    return await this.base.createSession({
      ...options,
      language: options.language ?? this.language,
      headers: {
        ...this.headers,
        ...(options.headers ?? {}),
      },
    });
  }
}
