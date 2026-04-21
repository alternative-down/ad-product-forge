import { randomUUID } from 'node:crypto';

import type { AgentRuntime } from '../../core/runtime.js';
import type { AvatarGateway } from '../../integrations/gateways/avatar.js';
import type {
  RealtimeSpeechToTextGateway,
  RealtimeSpeechToTextSession,
  TextToSpeechGateway,
} from '../../integrations/gateways/speech.js';
import { AvatarDirector } from './avatar-director.js';

export type RealtimeVoiceAgentOptions = {
  runtime: AgentRuntime;
  stt: RealtimeSpeechToTextGateway;
  tts: TextToSpeechGateway;
  avatar?: AvatarGateway;
  language?: string;
};

export class RealtimeVoiceAgent {
  private readonly runtime: AgentRuntime;
  private readonly stt: RealtimeSpeechToTextGateway;
  private readonly tts: TextToSpeechGateway;
  private readonly avatarDirector: AvatarDirector | null;
  private readonly language?: string;

  constructor(options: RealtimeVoiceAgentOptions) {
    this.runtime = options.runtime;
    this.stt = options.stt;
    this.tts = options.tts;
    this.avatarDirector = options.avatar
      ? new AvatarDirector({ avatar: options.avatar })
      : null;
    this.language = options.language;
  }

  async startSession() {
    const transcriptBuffer: string[] = [];
    const session = await this.stt.createSession({
      language: this.language,
      onTranscription: async (event) => {
        if (event.isFinal !== true) {
          return;
        }

        transcriptBuffer.push(event.text);
        await this.runtime.dispatch({
          id: event.id,
          type: 'speech-transcript',
          payload: {
            text: event.text,
            language: event.language,
          },
        });
      },
    });

    return new RealtimeVoiceAgentSession({
      runtime: this.runtime,
      sttSession: session,
      tts: this.tts,
      avatarDirector: this.avatarDirector,
      transcriptBuffer,
    });
  }
}

export type RealtimeVoiceAgentSessionOptions = {
  runtime: AgentRuntime;
  sttSession: RealtimeSpeechToTextSession;
  tts: TextToSpeechGateway;
  avatarDirector: AvatarDirector | null;
  transcriptBuffer: string[];
};

export class RealtimeVoiceAgentSession {
  private readonly runtime: AgentRuntime;
  private readonly sttSession: RealtimeSpeechToTextSession;
  private readonly tts: TextToSpeechGateway;
  private readonly avatarDirector: AvatarDirector | null;
  private readonly transcriptBuffer: string[];

  constructor(options: RealtimeVoiceAgentSessionOptions) {
    this.runtime = options.runtime;
    this.sttSession = options.sttSession;
    this.tts = options.tts;
    this.avatarDirector = options.avatarDirector;
    this.transcriptBuffer = options.transcriptBuffer;
  }

  async pushAudio(chunk: { mimeType: string; bytes: Uint8Array }) {
    await this.sttSession.pushAudio(chunk);
  }

  getTranscripts() {
    return [...this.transcriptBuffer];
  }

  async runStepAndSpeak() {
    const result = await this.runtime.step();

    if (!result) {
      return null;
    }

    if (this.avatarDirector) {
      await this.avatarDirector.presentStep(result.record);
    }

    const spokenText = result.record.modelResponse.segments
      .filter((segment) => segment.kind === 'message')
      .map((segment) => segment.text)
      .join('\n')
      .trim();

    if (!spokenText) {
      return {
        step: result.record,
        speech: null,
      };
    }

    const speech = await this.tts.synthesize({
      text: spokenText,
    });

    return {
      step: result.record,
      speech,
    };
  }

  async close() {
    await this.sttSession.close();
  }
}

export function createRealtimeTranscriptEvent(text: string) {
  return {
    id: randomUUID(),
    text,
    isFinal: true,
  };
}
