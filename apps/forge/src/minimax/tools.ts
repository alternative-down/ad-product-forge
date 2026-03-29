import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { MiniMaxManager } from './manager';

export const MINIMAX_TOOL_IDS = [
  'minimax_tts',
  'minimax_image',
  'minimax_video',
] as const;

export type MiniMaxToolId = (typeof MINIMAX_TOOL_IDS)[number];

/**
 * Create MiniMax creative tools for agents
 *
 * These tools allow agents to generate:
 * - TTS (Text-to-Speech) audio
 * - Images from text prompts
 * - Videos from text prompts
 */
export function createMiniMaxTools(
  minimax: MiniMaxManager,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};

  // TTS Tool
  if (!allowedToolIds || allowedToolIds.has('minimax_tts')) {
    tools.minimax_tts = createTool({
      id: 'minimax_tts',
      description:
        'Generate speech audio from text using MiniMax TTS API. Creates natural-sounding voice audio from text prompts.',
      inputSchema: z.object({
        text: z.string().min(1).describe('The text content to convert to speech.'),
        voice_id: z
          .string()
          .nullish()
          .describe(
            'Voice ID for the audio. Available voices: male-qn-qingse (Chinese male), female-shaosheng (Chinese female), male-tianmei (English male), female-qingxue (English female), male-yunyang (Korean male), female-qianhui (Korean female).',
          ),
        speed: z.number().nullish().describe('Speech speed (0.5-2.0, default 1.0).'),
        volume: z.number().nullish().describe('Audio volume (0.0-1.0, default 1.0).'),
        pitch: z.number().nullish().describe('Voice pitch adjustment (-10 to 10, default 0).'),
        output_format: z
          .enum(['mp3', 'wav', 'flac'])
          .nullish()
          .describe('Output audio format (default mp3).'),
      }),
      execute: async (input) => {
        try {
          const result = await minimax.textToSpeech({
            text: input.text,
            voiceSetting: input.voice_id
              ? {
                  voiceId: input.voice_id,
                  speed: input.speed ?? 1.0,
                  volume: input.volume ?? 1.0,
                  pitch: input.pitch ?? 0,
                }
              : undefined,
            outputFormat: input.output_format ?? 'mp3',
          });

          if (!result.success) {
            return {
              success: false,
              error: result.error?.message || 'Failed to generate speech',
            };
          }

          return {
            success: true,
            audio_file: result.data?.audio_file,
            audio_id: result.data?.audio_id,
            extra_info: result.data?.extra_info,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate speech',
          };
        }
      },
    });
  }

  // Image Generation Tool
  if (!allowedToolIds || allowedToolIds.has('minimax_image')) {
    tools.minimax_image = createTool({
      id: 'minimax_image',
      description:
        'Generate images from text prompts using MiniMax Image API. Creates high-quality images from descriptive text.',
      inputSchema: z.object({
        prompt: z.string().min(1).describe('Text description of the image to generate.'),
        style: z
          .string()
          .nullish()
          .describe(
            'Image style preset. Options: realistic (photorealistic), anime (animated style), 3d卡通 (3D cartoon), comic (comic book), watercolor (watercolor painting), black-and-white (monochrome).',
          ),
        width: z.number().nullish().describe('Image width in pixels (256-2048, default 1024).'),
        height: z.number().nullish().describe('Image height in pixels (256-2048, default 1024).'),
        image_count: z
          .number()
          .min(1)
          .max(4)
          .nullish()
          .describe('Number of images to generate (1-4, default 1).'),
      }),
      execute: async (input) => {
        try {
          const result = await minimax.generateImage({
            prompt: input.prompt,
            style: input.style || '<auto>',
            width: input.width ?? 1024,
            height: input.height ?? 1024,
            imageCount: input.image_count ?? 1,
          });

          if (!result.success) {
            return {
              success: false,
              error: result.error?.message || 'Failed to generate image',
            };
          }

          return {
            success: true,
            image_urls: result.data?.image_urls || [],
            extra_info: result.data?.extra_info,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate image',
          };
        }
      },
    });
  }

  // Video Generation Tool
  if (!allowedToolIds || allowedToolIds.has('minimax_video')) {
    tools.minimax_video = createTool({
      id: 'minimax_video',
      description:
        'Generate videos from text prompts using MiniMax Video API. Creates dynamic video content from descriptive prompts.',
      inputSchema: z.object({
        prompt: z.string().min(1).describe('Text description of the video to generate.'),
        duration: z
          .number()
          .min(3)
          .max(15)
          .nullish()
          .describe('Video duration in seconds (3-15, default 6).'),
        fps: z.number().nullish().describe('Frames per second (default 25).'),
        quality: z.enum(['standard', 'high']).nullish().describe('Video quality (default high).'),
      }),
      execute: async (input) => {
        try {
          const result = await minimax.generateVideo({
            prompt: input.prompt,
            duration: input.duration ?? 6,
            fsp: input.fps ?? 25,
            petal_scale: input.quality === 'standard' ? 0.8 : 1.0,
          });

          if (!result.success) {
            return {
              success: false,
              error: result.error?.message || 'Failed to generate video',
            };
          }

          return {
            success: true,
            task_id: result.data?.task_id,
            status: result.data?.status || 'completed',
            video_url: result.data?.video_url,
            extra_info: result.data?.extra_info,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate video',
          };
        }
      },
    });
  }

  return tools;
}
