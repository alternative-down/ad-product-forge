/**
 * Tests for minimax/manager.ts
 *
 * MiniMaxClient makes HTTP requests via global fetch().
 * We mock fetch per-test so each test has a clean state.
 * createMiniMaxManager uses an integration store — mocked at module level.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module-level mocks ──────────────────────────────────────────────────────

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('../system-integrations/store', () => ({
  createSystemIntegrationStore: vi.fn(),
}));

// ─── Mock fetch response helpers ────────────────────────────────────────────

type MockResponse = {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

function makeJsonResponse(body: unknown, status = 200): MockResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function makeTextResponse(text: string, status = 200): MockResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.reject(new Error('Not JSON')),
    text: () => Promise.resolve(text),
  };
}

function setupFetch(response: MockResponse) {
  globalThis.fetch = vi.fn().mockResolvedValue(response);
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('MiniMaxClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ── textToSpeech ─────────────────────────────────────────────────────────

  describe('textToSpeech', () => {
    it('returns audio hex on successful response', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { audio: 'DEADBEEF' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.textToSpeech({ text: 'Hello world' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ audioHex: 'DEADBEEF', audioFormat: 'mp3' });
    });

    it('returns success when data.data.audio is present (nested path)', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { audio: 'NESTED123' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.textToSpeech({ text: 'Hello' });

      expect(result.success).toBe(true);
      expect(result.data?.audioHex).toBe('NESTED123');
    });

    it('returns error when base_resp status_code is non-zero', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 40001, status_msg: 'invalid request' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.textToSpeech({ text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('40001');
      expect(result.error?.message).toBe('invalid request');
    });

    it('returns error when baseRespStatusCode (camelCase) is non-zero', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          baseRespStatusCode: 50000,
          baseRespStatusMsg: 'server error',
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.textToSpeech({ text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('50000');
      expect(result.error?.message).toBe('server error');
    });

    it('returns error when no audio data is present', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {},
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.textToSpeech({ text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_RESPONSE');
    });

    it('returns error when data is null', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.textToSpeech({ text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_RESPONSE');
    });

    it('returns network error when fetch rejects', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.textToSpeech({ text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.message).toBe('Connection refused');
    });

    it('returns network error on non-ok status with no JSON body', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(makeTextResponse('Bad Gateway', 502));

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.textToSpeech({ text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('502');
    });

    it('returns error on JSON body with non-ok status code', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(makeJsonResponse({ status_code: 500 }, 500));

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.textToSpeech({ text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('500');
    });

    it('uses custom voice settings when provided', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { audio: 'VOICE123' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.textToSpeech({
        text: 'Hello',
        voiceSetting: {
          voiceId: 'custom-voice',
          speed: 0.8,
          volume: 0.5,
          pitch: 2,
        },
        outputFormat: 'wav',
        languageBoost: 'pt-BR',
        pronunciationToneReplacements: ['foo/bar'],
      });

      expect(result.success).toBe(true);

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);

      expect(body.voice_setting.voice_id).toBe('custom-voice');
      expect(body.voice_setting.speed).toBe(0.8);
      expect(body.voice_setting.vol).toBe(0.5);
      expect(body.voice_setting.pitch).toBe(2);
      expect(body.audio_setting.format).toBe('wav');
      expect(body.language_boost).toBe('pt-BR');
      expect(body.pronunciation_dict.tone).toEqual(['foo/bar']);
    });

    it('uses default voice id when voiceSetting is not provided', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { audio: 'AUDIO' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      await client.textToSpeech({ text: 'Hello' });

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);

      expect(body.voice_setting.voice_id).toBe('Portuguese_CaptivatingStoryteller');
    });

    it('handles voice settings with only voiceId provided', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { audio: 'AUDIO' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      await client.textToSpeech({
        text: 'Hello',
        voiceSetting: { voiceId: 'only-id-voice' },
      });

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);

      expect(body.voice_setting.voice_id).toBe('only-id-voice');
      expect(body.voice_setting.speed).toBe(1);
    });
  });
  // ── listVoices ───────────────────────────────────────────────────────────

  describe('listVoices', () => {
    it('parses system voices correctly', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {
            system_voice: [
              {
                voice_id: 'voice-1',
                voice_name: 'Voice One',
                description: ['Desc A', 'Desc B'],
                created_time: '2024-01-01',
              },
            ],
            voice_cloning: [],
            voice_generation: [],
          },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.listVoices('system');

      expect(result.success).toBe(true);
      expect(result.data?.systemVoices).toEqual([
        {
          voiceId: 'voice-1',
          voiceName: 'Voice One',
          description: ['Desc A', 'Desc B'],
          createdTime: '2024-01-01',
        },
      ]);
      expect(result.data?.voiceCloning).toEqual([]);
      expect(result.data?.voiceGeneration).toEqual([]);
    });

    it('parses voice_cloning and voice_generation categories', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {
            system_voice: [],
            voice_cloning: [{ voice_id: 'clone-1', description: ['clone voice'] }],
            voice_generation: [{ voice_id: 'gen-1', description: ['gen voice'] }],
          },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.listVoices('all');

      expect(result.success).toBe(true);
      expect(result.data?.voiceCloning).toHaveLength(1);
      expect(result.data?.voiceGeneration).toHaveLength(1);
    });

    it('returns error on non-zero base_resp status_code', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 40002, status_msg: 'invalid voice type' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.listVoices('system');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('40002');
    });

    it('skips voice records without voice_id', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {
            system_voice: [
              { name: 'no-id-voice' },
              { voice_id: 'valid-voice', description: ['valid'] },
            ],
            voice_cloning: [],
            voice_generation: [],
          },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.listVoices('system');

      expect(result.success).toBe(true);
      expect(result.data?.systemVoices).toHaveLength(1);
      expect(result.data?.systemVoices[0].voiceId).toBe('valid-voice');
    });

    it('handles non-array description field gracefully', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {
            system_voice: [{ voice_id: 'voice-1', description: 'not an array' }],
            voice_cloning: [],
            voice_generation: [],
          },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.listVoices('system');

      expect(result.success).toBe(true);
      expect(result.data?.systemVoices[0].description).toEqual([]);
    });
  });

  // ── generateImage ────────────────────────────────────────────────────────

  describe('generateImage', () => {
    it('returns images on successful response', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { image_base64: ['abc123', 'xyz789'] },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.generateImage({ prompt: 'A cat' });

      expect(result.success).toBe(true);
      expect(result.data?.images).toEqual(['abc123', 'xyz789']);
    });

    it('returns error when no images returned', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { image_base64: [] },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.generateImage({ prompt: 'A cat' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_RESPONSE');
    });

    it('returns error on non-zero base_resp status_code', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 50003, status_msg: 'rate limit exceeded' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.generateImage({ prompt: 'A cat' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('50003');
    });

    it('includes subject reference when provided', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { image_base64: ['base64image'] },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      await client.generateImage({
        prompt: 'A cat',
        subjectReference: [{ type: 'image', imageFile: 'ref-img-1' }],
      });

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);

      expect(body.subject_reference).toEqual([{ type: 'image', image_file: 'ref-img-1' }]);
    });

    it('uses default model when not provided', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { image_base64: ['img'] },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      await client.generateImage({ prompt: 'A cat' });

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);

      expect(body.model).toBe('image-01');
      expect(body.response_format).toBe('base64');
    });

    it('applies width and height when provided', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { image_base64: ['img'] },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      await client.generateImage({ prompt: 'A cat', width: 1024, height: 768 });

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);

      expect(body.width).toBe(1024);
      expect(body.height).toBe(768);
    });
  });

  // ── createVideoGenerationTask ────────────────────────────────────────────

  describe('createVideoGenerationTask', () => {
    it('returns taskId on successful response', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { task_id: 'task-12345' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.createVideoGenerationTask({ prompt: 'A bird' });

      expect(result.success).toBe(true);
      expect(result.data?.taskId).toBe('task-12345');
    });

    it('returns error on non-zero base_resp status_code', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 40003, status_msg: 'invalid prompt' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.createVideoGenerationTask({ prompt: 'A bird' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('40003');
    });

    it('returns error when no task_id in response', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {},
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.createVideoGenerationTask({ prompt: 'A bird' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_RESPONSE');
    });

    it('uses default model, duration, and resolution when not provided', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { task_id: 'task-abc' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      await client.createVideoGenerationTask({ prompt: 'A bird' });

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);

      expect(body.model).toBe('MiniMax-Hailuo-2.3');
      expect(body.duration).toBe(6);
      expect(body.resolution).toBe('1080P');
    });

    it('includes first_frame_image and last_frame_image when provided', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { task_id: 'task-xyz' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      await client.createVideoGenerationTask({
        prompt: 'A bird',
        firstFrameImage: 'frame-001',
        lastFrameImage: 'frame-002',
      });

      const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);

      expect(body.first_frame_image).toBe('frame-001');
      expect(body.last_frame_image).toBe('frame-002');
    });
  });

  // ── queryVideoGeneration ────────────────────────────────────────────────

  describe('queryVideoGeneration', () => {
    it('returns status on successful response', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {
            task_id: 'task-999',
            status: 'Processing',
            file_id: 'file-abc',
            failure_reason: null,
          },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.queryVideoGeneration('task-999');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        taskId: 'task-999',
        status: 'Processing',
        fileId: 'file-abc',
        failureReason: undefined,
      });
    });

    it('returns error on non-zero base_resp status_code', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 40004, status_msg: 'task not found' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.queryVideoGeneration('task-999');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('40004');
    });

    it('returns error when no data in response', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.queryVideoGeneration('task-999');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_RESPONSE');
    });

    it('falls back to error_message for failure reason when failure_reason is absent', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {
            task_id: 'task-999',
            status: 'Failed',
            error_message: 'Render failed: out of memory',
          },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.queryVideoGeneration('task-999');

      expect(result.success).toBe(true);
      expect(result.data?.failureReason).toBe('Render failed: out of memory');
    });
  });

  // ── retrieveFile ────────────────────────────────────────────────────────

  describe('retrieveFile', () => {
    it('returns file metadata on successful response', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {
            file: {
              filename: 'video-output.mp4',
              download_url: 'https://cdn.minimax.io/files/abc123',
            },
          },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.retrieveFile('file-abc');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        fileId: 'file-abc',
        fileName: 'video-output.mp4',
        downloadUrl: 'https://cdn.minimax.io/files/abc123',
      });
    });

    it('returns error on non-zero base_resp status_code', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 50004, status_msg: 'file not found' },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.retrieveFile('file-abc');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('50004');
    });

    it('returns error when file object is missing download_url', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { file: {} },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.retrieveFile('file-abc');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_RESPONSE');
    });

    it('returns error when file object is absent from data', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {},
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.retrieveFile('file-abc');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_RESPONSE');
    });

    it('returns fileId as provided even when filename is absent', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: {
            file: {
              download_url: 'https://cdn.minimax.io/files/xyz789',
            },
          },
        }),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.retrieveFile('my-file-id');

      expect(result.success).toBe(true);
      expect(result.data?.fileId).toBe('my-file-id');
      expect(result.data?.fileName).toBeUndefined();
      expect(result.data?.downloadUrl).toBe('https://cdn.minimax.io/files/xyz789');
    });
  });

  // ── requestJson edge cases ─────────────────────────────────────────────

  describe('requestJson error handling', () => {
    it('returns error when response body is an array', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(makeJsonResponse(['array', 'result'], 200));

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.generateImage({ prompt: 'test' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_RESPONSE');
    });

    it('returns error when response body is empty string', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(makeTextResponse('', 200));

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.generateImage({ prompt: 'test' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_RESPONSE');
    });

    it('extracts error message from status_msg field', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse(
          {
            status_msg: 'custom error message from status_msg',
          },
          500,
        ),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.generateImage({ prompt: 'test' });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('custom error message from status_msg');
    });

    it('extracts error message from body.message field', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse(
          {
            message: 'custom error from message field',
          },
          400,
        ),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.generateImage({ prompt: 'test' });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('custom error from message field');
    });

    it('extracts error message from body.error field', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(
        makeJsonResponse(
          {
            error: 'error field message',
          },
          403,
        ),
      );

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.generateImage({ prompt: 'test' });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('error field message');
    });

    it('falls back to raw body when no error fields present', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(makeTextResponse('raw error text', 500));

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.generateImage({ prompt: 'test' });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('raw error text');
    });

    it('falls back to default message when no body at all', async () => {
      const { MiniMaxClient } = await import('./manager.js');
      setupFetch(makeTextResponse('', 503));

      const client = new MiniMaxClient({ apiKey: 'test-key' });
      const result = await client.generateImage({ prompt: 'test' });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('MiniMax request failed with status 503');
    });
  });

  // ── createMiniMaxManager ────────────────────────────────────────────────

  describe('createMiniMaxManager', () => {
    it('returns a manager with all methods', async () => {
      const mockGetMinimaxConfig = vi.fn().mockResolvedValue({ apiKey: 'manager-key' });
      const mockStore = {
        getMinimaxConfig: mockGetMinimaxConfig,
      };

      const { createMiniMaxManager } = await import('./manager.js');
      const manager = createMiniMaxManager({ integrations: mockStore as any });

      expect(typeof manager.textToSpeech).toBe('function');
      expect(typeof manager.listVoices).toBe('function');
      expect(typeof manager.generateImage).toBe('function');
      expect(typeof manager.createVideoGenerationTask).toBe('function');
      expect(typeof manager.queryVideoGeneration).toBe('function');
      expect(typeof manager.retrieveFile).toBe('function');
    });

    it('textToSpeech forwards to MiniMaxClient with config from store', async () => {
      const mockGetMinimaxConfig = vi.fn().mockResolvedValue({ apiKey: 'manager-api-key' });
      const mockStore = {
        getMinimaxConfig: mockGetMinimaxConfig,
      };

      setupFetch(
        makeJsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { audio: 'MANAGER_AUDIO' },
        }),
      );

      const { createMiniMaxManager } = await import('./manager.js');
      const manager = createMiniMaxManager({ integrations: mockStore as any });
      const result = await manager.textToSpeech({ text: 'manager test' });

      expect(result.success).toBe(true);
      expect(result.data?.audioHex).toBe('MANAGER_AUDIO');
      expect(mockGetMinimaxConfig).toHaveBeenCalled();
    });

    it('throws when integration store has no config', async () => {
      const mockGetMinimaxConfig = vi.fn().mockResolvedValue(null);
      const mockStore = {
        getMinimaxConfig: mockGetMinimaxConfig,
      };

      const { createMiniMaxManager } = await import('./manager.js');
      const manager = createMiniMaxManager({ integrations: mockStore as any });

      await expect(manager.textToSpeech({ text: 'test' })).rejects.toThrow(
        'MiniMax integration is not configured',
      );
    });
  });

  // ── createMiniMaxClient factory ────────────────────────────────────────

  describe('createMiniMaxClient', () => {
    it('creates client from apiKey argument', async () => {
      const { createMiniMaxClient } = await import('./manager.js');
      const client = createMiniMaxClient('direct-key');

      expect(client.constructor.name).toBe('MiniMaxClient');
    });

    it('throws when no key provided and env var absent', async () => {
      const originalEnv = process.env.MINIMAX_API_KEY;
      delete process.env.MINIMAX_API_KEY;

      const { createMiniMaxClient } = await import('./manager.js');

      expect(() => createMiniMaxClient()).toThrow(
        'MINIMAX_API_KEY environment variable is not set',
      );

      if (originalEnv !== undefined) {
        process.env.MINIMAX_API_KEY = originalEnv;
      }
    });
  });
});
