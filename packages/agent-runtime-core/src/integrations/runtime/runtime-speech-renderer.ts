import { getStepMessageText } from '../../core/step-output.js';
import type { StepRecord } from '../../core/types.js';
import {
  BufferedStreamingTextToSpeechGateway,
} from '../gateways/buffered-streaming-tts.js';
import type {
  StreamingTextToSpeechGateway,
  StreamingTextToSpeechResponse,
  TextToSpeechGateway,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from '../gateways/speech.js';

export type RuntimeSpeechRendererOptions = {
  tts?: TextToSpeechGateway;
  streamingTts?: StreamingTextToSpeechGateway;
};

export class RuntimeSpeechRenderer {
  private readonly tts: TextToSpeechGateway | null;
  private readonly streamingTts: StreamingTextToSpeechGateway | null;

  constructor(options: RuntimeSpeechRendererOptions) {
    this.tts = options.tts ?? null;
    this.streamingTts = options.streamingTts
      ?? (options.tts ? new BufferedStreamingTextToSpeechGateway({ tts: options.tts }) : null);
  }

  async renderText(
    text: string,
    request: Omit<TextToSpeechRequest, 'text'> = {},
  ): Promise<TextToSpeechResponse | null> {
    if (!this.tts || !text.trim()) {
      return null;
    }

    return this.tts.synthesize({
      ...request,
      text,
    });
  }

  async renderTextStream(
    text: string,
    request: Omit<TextToSpeechRequest, 'text'> = {},
  ): Promise<StreamingTextToSpeechResponse | null> {
    if (!this.streamingTts || !text.trim()) {
      return null;
    }

    return this.streamingTts.synthesizeStream({
      ...request,
      text,
    });
  }

  async renderStep(
    record: StepRecord,
    request: Omit<TextToSpeechRequest, 'text'> = {},
  ): Promise<TextToSpeechResponse | null> {
    return this.renderText(getStepMessageText(record), request);
  }

  async renderStepStream(
    record: StepRecord,
    request: Omit<TextToSpeechRequest, 'text'> = {},
  ): Promise<StreamingTextToSpeechResponse | null> {
    return this.renderTextStream(getStepMessageText(record), request);
  }
}
