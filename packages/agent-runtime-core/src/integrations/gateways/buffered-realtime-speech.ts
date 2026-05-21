import { randomUUID } from 'node:crypto';

import type {
  AudioChunk,
  RealtimeSpeechToTextGateway,
  RealtimeSpeechToTextSession,
  SpeechToTextGateway,
} from './speech.js';

export type BufferedRealtimeSpeechToTextGatewayOptions = {
  stt: SpeechToTextGateway;
};

export class BufferedRealtimeSpeechToTextGateway implements RealtimeSpeechToTextGateway {
  private readonly stt: SpeechToTextGateway;

  constructor(options: BufferedRealtimeSpeechToTextGatewayOptions) {
    this.stt = options.stt;
  }

  async createSession(
    options: {
      language?: string;
      headers?: Record<string, string>;
      onTranscription?(event: {
        id: string;
        text: string;
        isFinal: boolean;
        language?: string;
      }): Promise<void> | void;
    } = {},
  ): Promise<RealtimeSpeechToTextSession> {
    return new BufferedRealtimeSpeechToTextSession({
      stt: this.stt,
      language: options.language,
      headers: options.headers,
      onTranscription: options.onTranscription,
    });
  }
}

type BufferedRealtimeSpeechToTextSessionOptions = {
  stt: SpeechToTextGateway;
  language?: string;
  headers?: Record<string, string>;
  onTranscription?(event: {
    id: string;
    text: string;
    isFinal: boolean;
    language?: string;
  }): Promise<void> | void;
};

class BufferedRealtimeSpeechToTextSession implements RealtimeSpeechToTextSession {
  readonly id = randomUUID();

  private readonly stt: SpeechToTextGateway;
  private readonly language: string | undefined;
  private readonly headers: Record<string, string> | undefined;
  private readonly onTranscription: BufferedRealtimeSpeechToTextSessionOptions['onTranscription'];
  private readonly chunks: AudioChunk[] = [];
  private closed = false;

  constructor(options: BufferedRealtimeSpeechToTextSessionOptions) {
    this.stt = options.stt;
    this.language = options.language;
    this.headers = options.headers;
    this.onTranscription = options.onTranscription;
  }

  async pushAudio(chunk: AudioChunk): Promise<void> {
    if (this.closed) {
      throw new Error('Cannot push audio after the realtime speech session is closed');
    }

    this.chunks.push(chunk);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    if (this.chunks.length === 0) {
      return;
    }

    const merged = mergeAudioChunks(this.chunks);
    const transcription = await this.stt.transcribe({
      audio: merged,
      language: this.language,
      headers: this.headers,
    });

    await this.onTranscription?.({
      id: randomUUID(),
      text: transcription.text,
      isFinal: true,
      language: this.language,
    });
  }
}

function mergeAudioChunks(chunks: AudioChunk[]): AudioChunk {
  const mimeType = chunks[0]?.mimeType ?? 'audio/wav';
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.bytes.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk.bytes, offset);
    offset += chunk.bytes.length;
  }

  return {
    mimeType,
    bytes,
  };
}
