import type {
  AudioChunk,
  StreamingTextToSpeechGateway,
  StreamingTextToSpeechResponse,
  TextToSpeechGateway,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from './speech.js';

export type BufferedStreamingTextToSpeechGatewayOptions = {
  tts: TextToSpeechGateway;
};

export class BufferedStreamingTextToSpeechGateway implements StreamingTextToSpeechGateway {
  private readonly tts: TextToSpeechGateway;

  constructor(options: BufferedStreamingTextToSpeechGatewayOptions) {
    this.tts = options.tts;
  }

  async synthesizeStream(request: TextToSpeechRequest): Promise<StreamingTextToSpeechResponse> {
    const response = await this.tts.synthesize(request);

    return {
      mimeType: response.mimeType,
      stream: createSingleChunkStream(response),
    };
  }
}

export async function collectStreamingTextToSpeech(
  response: StreamingTextToSpeechResponse,
): Promise<TextToSpeechResponse> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for await (const chunk of response.stream) {
    chunks.push(chunk.bytes);
    totalLength += chunk.bytes.length;
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return {
    mimeType: response.mimeType,
    bytes: merged,
  };
}

export async function consumeStreamingTextToSpeech(
  response: StreamingTextToSpeechResponse,
  onChunk: (chunk: AudioChunk) => Promise<void> | void,
) {
  for await (const chunk of response.stream) {
    await onChunk(chunk);
  }
}

async function* createSingleChunkStream(response: TextToSpeechResponse): AsyncIterable<AudioChunk> {
  await Promise.resolve();
  yield {
    mimeType: response.mimeType,
    bytes: response.bytes,
  };
}
