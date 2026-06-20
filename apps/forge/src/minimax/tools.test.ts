import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMiniMaxTools } from './tools';

const mocks = vi.hoisted(() => ({
  listVoices: vi.fn(),
  textToSpeech: vi.fn(),
  generateImage: vi.fn(),
  createVideoGenerationTask: vi.fn(),
  queryVideoGeneration: vi.fn(),
  retrieveFile: vi.fn(),
}));

vi.mock('./manager', () => ({
  createMiniMaxManager: vi.fn(() => ({
    listVoices: mocks.listVoices,
    textToSpeech: mocks.textToSpeech,
    generateImage: mocks.generateImage,
    createVideoGenerationTask: mocks.createVideoGenerationTask,
    queryVideoGeneration: mocks.queryVideoGeneration,
    retrieveFile: mocks.retrieveFile,
  })),
}));

function mockMinimaxManager() {
  return {
    listVoices: mocks.listVoices,
    textToSpeech: mocks.textToSpeech,
    generateImage: mocks.generateImage,
    createVideoGenerationTask: mocks.createVideoGenerationTask,
    queryVideoGeneration: mocks.queryVideoGeneration,
    retrieveFile: mocks.retrieveFile,
  };
}

function mockContext() {
  return {
    workspace: {
      filesystem: {
        writeFile: vi.fn().mockResolvedValue('/workspace/generated/minimax/test.mp3'),
      },
    },
  } as any;
}

describe('createMiniMaxTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tool registration', () => {
    it('registers all tools when allowedToolIds is null', () => {
      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      expect(tools).toHaveProperty('list_minimax_voices');
      expect(tools).toHaveProperty('minimax_tts');
      expect(tools).toHaveProperty('minimax_image');
      // minimax_video is not registered because videoToolEnabled is false
      expect(tools).not.toHaveProperty('minimax_video');
    });

    it('registers only allowed tools when allowedToolIds is a Set', () => {
      const tools = createMiniMaxTools(
        mockMinimaxManager(),
        new Set(['list_minimax_voices', 'minimax_tts']),
      );
      expect(tools).toHaveProperty('list_minimax_voices');
      expect(tools).toHaveProperty('minimax_tts');
      expect(tools).not.toHaveProperty('minimax_image');
      expect(tools).not.toHaveProperty('minimax_video');
    });

    it('registers nothing when allowedToolIds is an empty Set', () => {
      const tools = createMiniMaxTools(mockMinimaxManager(), new Set());
      expect(Object.keys(tools)).toHaveLength(0);
    });
  });

  describe('list_minimax_voices', () => {
    it('returns valid result with voice list on success', async () => {
      const mockVoices = [
        { voiceId: 'voice-1', name: 'Alice', language: 'en-US' },
        { voiceId: 'voice-2', name: 'Bob', language: 'pt-BR' },
      ];
      mocks.listVoices.mockResolvedValue({
        success: true,
        data: { voices: mockVoices, voiceType: 'all' },
      });

      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.list_minimax_voices as any).execute({});
      expect(result.valid).toBe(true);
      expect(result.data.voices).toEqual(mockVoices);
    });

    it('returns valid=false with hint when API returns error', async () => {
      mocks.listVoices.mockResolvedValue({
        success: false,
        error: { message: 'Invalid API key', code: undefined },
      });

      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.list_minimax_voices as any).execute({});
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
      expect(result.hint).toContain('MiniMax integration');
    });

    it('returns valid=false with hint on exception', async () => {
      mocks.listVoices.mockRejectedValue(new Error('Network error'));

      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.list_minimax_voices as any).execute({});
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('minimax_tts', () => {
    it('returns valid=false when MiniMax returns error', async () => {
      mocks.textToSpeech.mockResolvedValue({
        success: false,
        error: { message: 'Rate limit exceeded', code: '429' },
      });

      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.minimax_tts as any).execute(
        { text: 'Hello world', voice_id: 'voice-1' },
        mockContext(),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });

    it('returns valid=false on exception', async () => {
      mocks.textToSpeech.mockRejectedValue(new Error('Unexpected failure'));

      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.minimax_tts as any).execute(
        { text: 'Hello world', voice_id: 'voice-1' },
        mockContext(),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unexpected failure');
    });

    it('returns valid=false when no filesystem available', async () => {
      mocks.textToSpeech.mockResolvedValue({
        success: true,
        data: { audioHex: 'abcdef123456', audioFormat: 'mp3' },
      });

      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.minimax_tts as any).execute(
        { text: 'Hello world', voice_id: 'voice-1' },
        { workspace: {} },
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('workspace filesystem');
    });

    it('returns valid=true with path on success', async () => {
      mocks.textToSpeech.mockResolvedValue({
        success: true,
        data: { audioHex: 'abcdef123456', audioFormat: 'mp3' },
      });

      const ctx = mockContext();
      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.minimax_tts as any).execute(
        { text: 'Hello world', voice_id: 'voice-1' },
        ctx,
      );

      expect(mocks.textToSpeech).toHaveBeenCalledWith({
        text: 'Hello world',
        voiceSetting: {
          voiceId: 'voice-1',
          speed: undefined,
          volume: undefined,
          pitch: undefined,
        },
        languageBoost: undefined,
        pronunciationToneReplacements: undefined,
        outputFormat: 'mp3',
      });
      expect(result.valid).toBe(true);
      expect(result.data.path).toBeDefined();
    });

    it('returns valid=false with code 2013 hint when params rejected', async () => {
      mocks.textToSpeech.mockResolvedValue({
        success: false,
        error: { message: 'Invalid parameters', code: '2013' },
      });

      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.minimax_tts as any).execute(
        { text: 'Hello world', voice_id: 'voice-1' },
        mockContext(),
      );
      expect(result.valid).toBe(false);
      expect(result.hint).toContain('MiniMax rejected');
    });
  });

  describe('minimax_image', () => {
    it('returns valid=false when MiniMax returns error', async () => {
      mocks.generateImage.mockResolvedValue({
        success: false,
        error: { message: 'Invalid prompt', code: '2013' },
      });

      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.minimax_image as any).execute({ prompt: 'A cat' }, mockContext());
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid prompt');
    });

    it('returns valid=false on exception', async () => {
      mocks.generateImage.mockRejectedValue(new Error('Unexpected failure'));

      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.minimax_image as any).execute({ prompt: 'A cat' }, mockContext());
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unexpected failure');
    });

    it('returns valid=false when no filesystem available', async () => {
      mocks.generateImage.mockResolvedValue({
        success: true,
        data: { images: ['aGVsbG8gd29ybGQ='] }, // base64 "hello world"
      });

      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.minimax_image as any).execute(
        { prompt: 'A cat' },
        { workspace: {} },
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('workspace filesystem');
    });

    it('returns valid=true with path on success', async () => {
      mocks.generateImage.mockResolvedValue({
        success: true,
        data: { images: ['aGVsbG8gd29ybGQ=', 'Z29vZCBt b3JuaW5n'] },
      });

      const ctx = mockContext();
      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      const result = await (tools.minimax_image as any).execute(
        {
          prompt: 'A cat',
          aspect_ratio: '16:9',
          width: 1024,
          height: 576,
        },
        ctx,
      );

      expect(mocks.generateImage).toHaveBeenCalledWith({
        prompt: 'A cat',
        model: undefined,
        aspectRatio: '16:9',
        width: 1024,
        height: 576,
        imageCount: 1,
        subjectReference: undefined,
      });
      expect(result.valid).toBe(true);
      expect(result.data.path).toBeDefined();
    });
  });

  describe('minimax_video', () => {
    it('skips video tool registration when videoToolEnabled is false', async () => {
      const tools = createMiniMaxTools(mockMinimaxManager(), null);
      expect(tools).not.toHaveProperty('minimax_video');
    });
  });
});
