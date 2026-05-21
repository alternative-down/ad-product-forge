import { randomUUID } from 'node:crypto';

import { consumeStreamingTextToSpeech } from './buffered-streaming-tts.js';
import type {
  RealtimeTextToSpeechGateway,
  RealtimeTextToSpeechSession,
  StreamingTextToSpeechGateway,
  TextToSpeechGateway,
} from './speech.js';

export type BufferedRealtimeTextToSpeechGatewayOptions = {
  streamingTts?: StreamingTextToSpeechGateway;
  tts?: TextToSpeechGateway;
};

export class BufferedRealtimeTextToSpeechGateway implements RealtimeTextToSpeechGateway {
  private readonly streamingTts: StreamingTextToSpeechGateway;

  constructor(options: BufferedRealtimeTextToSpeechGatewayOptions) {
    if (options.streamingTts) {
      this.streamingTts = options.streamingTts;
      return;
    }

    if (!options.tts) {
      throw new Error('BufferedRealtimeTextToSpeechGateway requires streamingTts or tts.');
    }

    this.streamingTts = {
      async synthesizeStream(request) {
        const response = await options.tts!.synthesize(request);

        return {
          mimeType: response.mimeType,
          stream: (async function* () {
            yield response;
          })(),
        };
      },
    };
  }

  async createSession(
    options: {
      voiceId?: string;
      headers?: Record<string, string>;
      onAudioChunk?(event: {
        chunk: { mimeType: string; bytes: Uint8Array };
        isFinal?: boolean;
      }): Promise<void> | void;
    } = {},
  ): Promise<RealtimeTextToSpeechSession> {
    return new BufferedRealtimeTextToSpeechSession({
      streamingTts: this.streamingTts,
      voiceId: options.voiceId,
      headers: options.headers,
      onAudioChunk: options.onAudioChunk,
    });
  }
}

type BufferedRealtimeTextToSpeechSessionOptions = {
  streamingTts: StreamingTextToSpeechGateway;
  voiceId?: string;
  headers?: Record<string, string>;
  onAudioChunk?(event: {
    chunk: { mimeType: string; bytes: Uint8Array };
    isFinal?: boolean;
  }): Promise<void> | void;
};

class BufferedRealtimeTextToSpeechSession implements RealtimeTextToSpeechSession {
  readonly id = randomUUID();
  private readonly streamingTts: StreamingTextToSpeechGateway;
  private readonly voiceId: string | undefined;
  private readonly headers: Record<string, string> | undefined;
  private readonly onAudioChunk: BufferedRealtimeTextToSpeechSessionOptions['onAudioChunk'];
  private closed = false;

  constructor(options: BufferedRealtimeTextToSpeechSessionOptions) {
    this.streamingTts = options.streamingTts;
    this.voiceId = options.voiceId;
    this.headers = options.headers;
    this.onAudioChunk = options.onAudioChunk;
  }

  async pushText(event: { text: string; isFinal?: boolean }): Promise<void> {
    if (this.closed || !event.text.trim()) {
      return;
    }

    const response = await this.streamingTts.synthesizeStream({
      text: event.text,
      voiceId: this.voiceId,
      headers: this.headers,
    });

    await consumeStreamingTextToSpeech(response, async (chunk) => {
      await this.onAudioChunk?.({
        chunk,
        isFinal: event.isFinal,
      });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
