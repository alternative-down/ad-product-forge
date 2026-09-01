import type { AudioChunk, TextToSpeechRequest } from '../gateways/speech.js';
import type { RealtimeSpeechRuntimeBridge } from './realtime-speech-runtime-bridge.js';
import type { RealtimeSpeechRuntimeSession } from './realtime-speech-runtime-bridge.js';
import type { RuntimeMessageEvent, RuntimeMessageStream } from './runtime-message-stream.js';
import type { RuntimeSpeechRenderer } from './runtime-speech-renderer.js';

export type RuntimeVoiceSessionOptions = {
  speechBridge: RealtimeSpeechRuntimeBridge;
  messageStream: RuntimeMessageStream;
  renderer: RuntimeSpeechRenderer;
  runtimeId?: string;
  renderMode?: 'batch' | 'stream' | 'off';
  createSpeechRequest?(event: RuntimeMessageEvent): Omit<TextToSpeechRequest, 'text'>;
  onText?(event: RuntimeMessageEvent): Promise<void> | void;
  onSpeech?(context: {
    event: RuntimeMessageEvent;
    response: {
      mimeType: string;
      bytes: Uint8Array;
    };
  }): Promise<void> | void;
  onSpeechStream?(context: {
    event: RuntimeMessageEvent;
    response: {
      mimeType: string;
      stream: AsyncIterable<AudioChunk>;
    };
  }): Promise<void> | void;
};

export class RuntimeVoiceSession {
  private readonly speechBridge: RealtimeSpeechRuntimeBridge;
  private readonly messageStream: RuntimeMessageStream;
  private readonly renderer: RuntimeSpeechRenderer;
  private readonly runtimeId: string | null;
  private readonly renderMode: 'batch' | 'stream' | 'off';
  private readonly createSpeechRequest: RuntimeVoiceSessionOptions['createSpeechRequest'];
  private readonly onText: RuntimeVoiceSessionOptions['onText'];
  private readonly onSpeech: RuntimeVoiceSessionOptions['onSpeech'];
  private readonly onSpeechStream: RuntimeVoiceSessionOptions['onSpeechStream'];

  constructor(options: RuntimeVoiceSessionOptions) {
    this.speechBridge = options.speechBridge;
    this.messageStream = options.messageStream;
    this.renderer = options.renderer;
    this.runtimeId = options.runtimeId ?? null;
    this.renderMode = options.renderMode ?? 'batch';
    this.createSpeechRequest = options.createSpeechRequest;
    this.onText = options.onText;
    this.onSpeech = options.onSpeech;
    this.onSpeechStream = options.onSpeechStream;
  }

  async start(
    options: {
      language?: string;
      headers?: Record<string, string>;
    } = {},
  ) {
    const speechSession = await this.speechBridge.startSession(options);
    const unsubscribe = this.messageStream.subscribe(async (event) => {
      await this.handleMessageEvent(event);
    });

    return new ActiveRuntimeVoiceSession({
      speechSession,
      close: async () => {
        unsubscribe();
        await speechSession.close();
      },
    });
  }

  private async handleMessageEvent(event: RuntimeMessageEvent) {
    if (this.runtimeId != null && event.runtimeId !== this.runtimeId) {
      return;
    }

    await this.onText?.(event);

    if (this.renderMode === 'off') {
      return;
    }

    const request = this.createSpeechRequest?.(event) ?? {};

    if (this.renderMode === 'stream') {
      const response = await this.renderer.renderTextStream(event.text, request);

      if (!response) {
        return;
      }

      await this.onSpeechStream?.({
        event,
        response,
      });

      return;
    }

    const response = await this.renderer.renderText(event.text, request);

    if (!response) {
      return;
    }

    await this.onSpeech?.({
      event,
      response,
    });
  }
}

export type ActiveRuntimeVoiceSessionOptions = {
  speechSession: RealtimeSpeechRuntimeSession;
  close(): Promise<void>;
};

export class ActiveRuntimeVoiceSession {
  private readonly speechSession: RealtimeSpeechRuntimeSession;
  private readonly closeSession: () => Promise<void>;

  constructor(options: ActiveRuntimeVoiceSessionOptions) {
    this.speechSession = options.speechSession;
    this.closeSession = options.close;
  }

  get id() {
    return this.speechSession.id;
  }

  async pushAudio(chunk: AudioChunk) {
    await this.speechSession.pushAudio(chunk);
  }

  listTranscriptions() {
    return this.speechSession.listTranscriptions();
  }

  async close() {
    await this.closeSession();
  }
}
