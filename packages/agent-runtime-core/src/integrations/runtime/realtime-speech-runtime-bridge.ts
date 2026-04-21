import { randomUUID } from 'node:crypto';

import type {
  AudioChunk,
  RealtimeSpeechToTextGateway,
  RealtimeSpeechToTextSession,
  RealtimeTranscriptionEvent,
} from '../gateways/speech.js';
import {
  RuntimeInputBridge,
  type RuntimeInputBridgeOptions,
  type RuntimeInputTarget,
} from './runtime-input-bridge.js';

export type RealtimeSpeechDispatchTarget = RuntimeInputTarget;

export type RealtimeSpeechRuntimeBridgeOptions = {
  runtime: RealtimeSpeechDispatchTarget;
  stt: RealtimeSpeechToTextGateway;
  inputType?: string;
  includeInterim?: boolean;
  eventToInput?(event: RealtimeTranscriptionEvent): {
    id?: string;
    type?: string;
    payload: Record<string, unknown>;
  };
};

export class RealtimeSpeechRuntimeBridge {
  private readonly stt: RealtimeSpeechToTextGateway;
  private readonly includeInterim: boolean;
  private readonly inputBridge: RuntimeInputBridge<RealtimeTranscriptionEvent>;

  constructor(options: RealtimeSpeechRuntimeBridgeOptions) {
    this.stt = options.stt;
    this.includeInterim = options.includeInterim ?? false;
    this.inputBridge = new RuntimeInputBridge<RealtimeTranscriptionEvent>({
      runtime: options.runtime,
      eventToInput: createRealtimeSpeechInputMapper({
        inputType: options.inputType,
        eventToInput: options.eventToInput,
      }),
    });
  }

  async startSession(options: {
    language?: string;
    headers?: Record<string, string>;
  } = {}) {
    const transcripts: RealtimeTranscriptionEvent[] = [];
    const session = await this.stt.createSession({
      language: options.language,
      headers: options.headers,
      onTranscription: async (event) => {
        transcripts.push(event);

        if (!this.includeInterim && event.isFinal !== true) {
          return;
        }

        await this.inputBridge.push(event);
      },
    });

    return new RealtimeSpeechRuntimeSession({
      session,
      transcripts,
    });
  }
}

function createRealtimeSpeechInputMapper(input: {
  inputType?: string;
  eventToInput?: RealtimeSpeechRuntimeBridgeOptions['eventToInput'];
}): RuntimeInputBridgeOptions<RealtimeTranscriptionEvent>['eventToInput'] {
  const inputType = input.inputType ?? 'speech-transcript';

  return (event) => {
    const mappedInput = input.eventToInput
      ? input.eventToInput(event)
      : {
        payload: {
          text: event.text,
          language: event.language,
          isFinal: event.isFinal,
        },
      };

    return {
      id: mappedInput.id ?? event.id ?? randomUUID(),
      type: mappedInput.type ?? inputType,
      payload: mappedInput.payload,
    };
  };
}

export type RealtimeSpeechRuntimeSessionOptions = {
  session: RealtimeSpeechToTextSession;
  transcripts: RealtimeTranscriptionEvent[];
};

export class RealtimeSpeechRuntimeSession {
  private readonly session: RealtimeSpeechToTextSession;
  private readonly transcripts: RealtimeTranscriptionEvent[];

  constructor(options: RealtimeSpeechRuntimeSessionOptions) {
    this.session = options.session;
    this.transcripts = options.transcripts;
  }

  get id() {
    return this.session.id;
  }

  async pushAudio(chunk: AudioChunk) {
    await this.session.pushAudio(chunk);
  }

  listTranscriptions() {
    return [...this.transcripts];
  }

  async close() {
    await this.session.close();
  }
}
