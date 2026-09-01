import type { AudioChunk, RealtimeTextToSpeechGateway } from '../gateways/speech.js';
import type {
  RuntimeMessageChunkEvent,
  RuntimeMessageChunkStream,
} from './runtime-message-chunk-stream.js';

export type RuntimeStreamingVoiceSessionOptions = {
  messageStream: RuntimeMessageChunkStream;
  tts: RealtimeTextToSpeechGateway;
  runtimeId?: string;
  sessionOptions?: {
    voiceId?: string;
    headers?: Record<string, string>;
  };
  onTextChunk?(event: RuntimeMessageChunkEvent): Promise<void> | void;
  onAudioChunk?(context: {
    event: RuntimeMessageChunkEvent;
    chunk: AudioChunk;
    isFinal?: boolean;
  }): Promise<void> | void;
};

export class RuntimeStreamingVoiceSession {
  private readonly messageStream: RuntimeMessageChunkStream;
  private readonly tts: RealtimeTextToSpeechGateway;
  private readonly runtimeId: string | null;
  private readonly sessionOptions: RuntimeStreamingVoiceSessionOptions['sessionOptions'];
  private readonly onTextChunk: RuntimeStreamingVoiceSessionOptions['onTextChunk'];
  private readonly onAudioChunk: RuntimeStreamingVoiceSessionOptions['onAudioChunk'];

  constructor(options: RuntimeStreamingVoiceSessionOptions) {
    this.messageStream = options.messageStream;
    this.tts = options.tts;
    this.runtimeId = options.runtimeId ?? null;
    this.sessionOptions = options.sessionOptions;
    this.onTextChunk = options.onTextChunk;
    this.onAudioChunk = options.onAudioChunk;
  }

  async start() {
    let currentEvent: RuntimeMessageChunkEvent | null = null;
    const session = await this.tts.createSession({
      voiceId: this.sessionOptions?.voiceId,
      headers: this.sessionOptions?.headers,
      onAudioChunk: async ({ chunk, isFinal }) => {
        if (!currentEvent) {
          return;
        }

        await this.onAudioChunk?.({
          event: currentEvent,
          chunk,
          isFinal,
        });
      },
    });

    const completion = (async () => {
      try {
        for await (const event of this.messageStream) {
          if (this.runtimeId != null && event.runtimeId !== this.runtimeId) {
            continue;
          }

          currentEvent = event;
          await this.onTextChunk?.(event);
          await session.pushText({
            text: event.text,
            isFinal: false,
          });
        }
      } finally {
        await session.close();
      }
    })();

    return {
      id: session.id,
      completion,
      close: async () => {
        await session.close();
      },
    };
  }
}
