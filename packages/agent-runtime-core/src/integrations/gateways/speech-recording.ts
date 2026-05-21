import type { TextToSpeechGateway, TextToSpeechRequest, TextToSpeechResponse } from './speech.js';

export type SpeechSynthesisEvent = {
  text: string;
  voiceId?: string;
  mimeType: string;
  size: number;
  recordedAt: string;
};

export interface SpeechSynthesisRecorder {
  record(event: SpeechSynthesisEvent): Promise<void> | void;
}

export class InMemorySpeechSynthesisRecorder implements SpeechSynthesisRecorder {
  private readonly events: SpeechSynthesisEvent[] = [];

  async record(event: SpeechSynthesisEvent): Promise<void> {
    this.events.push(event);
  }

  list() {
    return [...this.events];
  }
}

export type RecordingTextToSpeechGatewayOptions = {
  base: TextToSpeechGateway;
  recorder: SpeechSynthesisRecorder;
};

export class RecordingTextToSpeechGateway implements TextToSpeechGateway {
  private readonly base: TextToSpeechGateway;
  private readonly recorder: SpeechSynthesisRecorder;

  constructor(options: RecordingTextToSpeechGatewayOptions) {
    this.base = options.base;
    this.recorder = options.recorder;
  }

  async synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResponse> {
    const response = await this.base.synthesize(request);

    await this.recorder.record({
      text: request.text,
      voiceId: request.voiceId,
      mimeType: response.mimeType,
      size: response.bytes.length,
      recordedAt: new Date().toISOString(),
    });

    return response;
  }
}
