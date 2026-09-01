import { describe, expect, it } from 'vitest';

import { ConfiguredImageGenerationGateway } from '../integrations/gateways/configured-image-generation-gateway.js';
import {
  ConfiguredRealtimeTextToSpeechGateway,
  ConfiguredRealtimeSpeechToTextGateway,
  ConfiguredSpeechToTextGateway,
  ConfiguredStreamingTextToSpeechGateway,
  ConfiguredTextToSpeechGateway,
} from '../integrations/gateways/configured-speech-gateways.js';
import { ConfiguredVisionGateway } from '../integrations/gateways/configured-vision-gateway.js';

describe('configured media gateways', () => {
  it('applies default voice and headers to text-to-speech requests', async () => {
    let receivedRequest: Record<string, unknown> | null = null;
    const gateway = new ConfiguredTextToSpeechGateway({
      base: {
        async synthesize(request) {
          receivedRequest = request;

          return {
            mimeType: 'audio/wav',
            bytes: new Uint8Array([1, 2, 3]),
          };
        },
      },
      voiceId: 'voice-default',
      headers: {
        'x-default': '1',
      },
    });

    await gateway.synthesize({
      text: 'hello',
      headers: {
        'x-request': '1',
      },
    });

    expect(receivedRequest).toEqual({
      text: 'hello',
      voiceId: 'voice-default',
      headers: {
        'x-default': '1',
        'x-request': '1',
      },
    });
  });

  it('applies default language and headers to speech-to-text requests', async () => {
    let receivedRequest: Record<string, unknown> | null = null;
    const gateway = new ConfiguredSpeechToTextGateway({
      base: {
        async transcribe(request) {
          receivedRequest = request;

          return {
            text: 'ok',
          };
        },
      },
      language: 'pt-BR',
      headers: {
        'x-default': '1',
      },
    });

    await gateway.transcribe({
      audio: {
        mimeType: 'audio/wav',
        bytes: new Uint8Array([1, 2, 3]),
      },
    });

    expect(receivedRequest).toEqual({
      audio: {
        mimeType: 'audio/wav',
        bytes: new Uint8Array([1, 2, 3]),
      },
      language: 'pt-BR',
      headers: {
        'x-default': '1',
      },
    });
  });

  it('applies default voice and headers to streaming text-to-speech requests', async () => {
    let receivedRequest: Record<string, unknown> | null = null;
    const gateway = new ConfiguredStreamingTextToSpeechGateway({
      base: {
        async synthesizeStream(request) {
          receivedRequest = request;

          return {
            mimeType: 'audio/wav',
            stream: createEmptyAudioStream(),
          };
        },
      },
      voiceId: 'voice-stream',
      headers: {
        'x-default': '1',
      },
    });

    await gateway.synthesizeStream({
      text: 'hello stream',
    });

    expect(receivedRequest).toEqual({
      text: 'hello stream',
      voiceId: 'voice-stream',
      headers: {
        'x-default': '1',
      },
    });
  });

  it('applies default language and headers to realtime speech sessions', async () => {
    let receivedOptions: Record<string, unknown> | null = null;
    const gateway = new ConfiguredRealtimeSpeechToTextGateway({
      base: {
        async createSession(options) {
          receivedOptions = options ?? {};

          return {
            id: 'realtime-session',
            async pushAudio() {},
            async close() {},
          };
        },
      },
      language: 'pt-BR',
      headers: {
        'x-default': '1',
      },
    });

    await gateway.createSession({
      headers: {
        'x-request': '1',
      },
    });

    expect(receivedOptions).toEqual({
      language: 'pt-BR',
      headers: {
        'x-default': '1',
        'x-request': '1',
      },
    });
  });

  it('applies default voice and headers to realtime text-to-speech sessions', async () => {
    let receivedOptions: Record<string, unknown> | null = null;
    const gateway = new ConfiguredRealtimeTextToSpeechGateway({
      base: {
        async createSession(options) {
          receivedOptions = options ?? {};

          return {
            id: 'realtime-tts-session',
            async pushText() {},
            async close() {},
          };
        },
      },
      voiceId: 'voice-realtime',
      headers: {
        'x-default': '1',
      },
    });

    await gateway.createSession({
      headers: {
        'x-request': '1',
      },
    });

    expect(receivedOptions).toEqual({
      voiceId: 'voice-realtime',
      headers: {
        'x-default': '1',
        'x-request': '1',
      },
    });
  });

  it('applies default model settings to image generation requests', async () => {
    let receivedRequest: Record<string, unknown> | null = null;
    const gateway = new ConfiguredImageGenerationGateway({
      base: {
        async generate(request) {
          receivedRequest = request;

          return {
            images: [],
          };
        },
      },
      model: 'image-model-1',
      aspectRatio: '16:9',
      responseFormat: 'base64',
    });

    await gateway.generate({
      prompt: 'castle',
    });

    expect(receivedRequest).toEqual({
      prompt: 'castle',
      model: 'image-model-1',
      aspectRatio: '16:9',
      responseFormat: 'base64',
    });
  });

  it('applies default headers to vision requests', async () => {
    let receivedRequest: Record<string, unknown> | null = null;
    const gateway = new ConfiguredVisionGateway({
      base: {
        async analyze(request) {
          receivedRequest = request;

          return {
            text: 'ok',
          };
        },
      },
      headers: {
        'x-default': '1',
      },
    });

    await gateway.analyze({
      prompt: 'describe image',
      images: [
        {
          mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
      headers: {
        'x-request': '1',
      },
    });

    expect(receivedRequest).toEqual({
      prompt: 'describe image',
      images: [
        {
          mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
      headers: {
        'x-default': '1',
        'x-request': '1',
      },
    });
  });
});

async function* createEmptyAudioStream() {
  yield {
    mimeType: 'audio/wav',
    bytes: new Uint8Array([1, 2, 3]),
  };
}
