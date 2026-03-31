import { createTool } from '@mastra/core/tools';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import type { MiniMaxManager } from './manager';

export const MINIMAX_TOOL_IDS = [
  'minimax_tts',
  'minimax_image',
  'minimax_video',
] as const;

export type MiniMaxToolId = (typeof MINIMAX_TOOL_IDS)[number];

const MINIMAX_OUTPUT_DIRECTORY = 'generated/minimax';

function buildMiniMaxHint(errorCode: string | undefined, fallback: string) {
  if (errorCode === '2061') {
    return 'The current MiniMax token plan does not support the requested model. Use a model enabled for this account or upgrade the MiniMax plan.';
  }

  if (errorCode === '2013') {
    return 'MiniMax rejected the request parameters. Review the tool arguments and the current MiniMax API parameter contract.';
  }

  return fallback;
}

const imageAspectRatioSchema = z.enum([
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
]);

function createMiniMaxOutputPath(
  workspaceDir: string,
  kind: 'tts' | 'images' | 'videos',
  extension: string,
  index?: number,
) {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  const fileName = index === undefined
    ? `${kind}-${timestamp}-${suffix}.${extension}`
    : `${kind}-${timestamp}-${suffix}-${index}.${extension}`;
  const relativePath = path.join(MINIMAX_OUTPUT_DIRECTORY, kind, fileName);
  const absolutePath = path.join(workspaceDir, relativePath);

  return {
    absolutePath,
    relativePath,
  };
}

async function ensureParentDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeBufferToWorkspace(
  workspaceDir: string,
  kind: 'tts' | 'images' | 'videos',
  extension: string,
  buffer: Buffer,
  index?: number,
) {
  const outputPath = createMiniMaxOutputPath(workspaceDir, kind, extension, index);
  await ensureParentDirectory(outputPath.absolutePath);
  await fs.writeFile(outputPath.absolutePath, buffer);
  return outputPath.relativePath;
}

async function downloadFileBuffer(downloadUrl: string) {
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(`MiniMax file download failed with status ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function inferExtensionFromUrl(downloadUrl: string, fallback: string) {
  const pathname = new URL(downloadUrl).pathname;
  const extension = path.extname(pathname).replace('.', '');
  return extension || fallback;
}

async function waitForVideoFile(
  minimax: MiniMaxManager,
  taskId: string,
) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await minimax.queryVideoGeneration(taskId);

    if (!status.success) {
      throw new Error(status.error?.message || 'Failed to query MiniMax video generation status');
    }

    const videoStatus = status.data?.status?.toLowerCase() ?? '';

    if (videoStatus === 'success' && status.data?.fileId) {
      return status.data.fileId;
    }

    if (videoStatus === 'failed') {
      throw new Error(status.data?.failureReason || 'MiniMax video generation failed');
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error('MiniMax video generation did not finish within the expected time window');
}

export function createMiniMaxTools(
  minimax: MiniMaxManager,
  workspaceDir: string,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};

  if (!allowedToolIds || allowedToolIds.has('minimax_tts')) {
    tools.minimax_tts = createTool({
      id: 'minimax_tts',
      description:
        'Generate speech audio with MiniMax, save the audio file into the workspace, and return the saved path.',
      inputSchema: z.object({
        text: z.string().min(1).describe('The text content to convert to speech.'),
        model: z.string().nullish().describe('MiniMax speech model, for example speech-2.8-turbo or speech-2.8-hd.'),
        voice_id: z.string().nullish().describe('Voice ID to use for the generated speech.'),
        speed: z.number().nullish().describe('Speech speed multiplier.'),
        volume: z.number().nullish().describe('Speech volume multiplier.'),
        pitch: z.number().nullish().describe('Pitch adjustment.'),
        output_format: z.enum(['mp3', 'wav', 'flac']).nullish().describe('Audio file format.'),
      }),
      execute: async (input) => {
        try {
          const result = await minimax.textToSpeech({
            text: input.text,
            model: input.model ?? undefined,
            voiceSetting: input.voice_id
              ? {
                  voiceId: input.voice_id,
                  speed: input.speed ?? undefined,
                  volume: input.volume ?? undefined,
                  pitch: input.pitch ?? undefined,
                }
              : undefined,
            outputFormat: input.output_format ?? 'mp3',
          });

          if (!result.success || !result.data) {
            return {
              valid: false,
              error: result.error?.message || 'Failed to generate speech',
              hint: buildMiniMaxHint(
                result.error?.code,
                'Verify the MiniMax integration is configured and the selected speech options are supported.',
              ),
            };
          }

          const audioBuffer = Buffer.from(result.data.audioHex, 'hex');
          const savedPath = await writeBufferToWorkspace(
            workspaceDir,
            'tts',
            result.data.audioFormat,
            audioBuffer,
          );

          return {
            valid: true,
            path: savedPath,
          };
        } catch (error) {
          return {
            valid: false,
            error: error instanceof Error ? error.message : 'Failed to generate speech',
            hint: 'Verify the MiniMax integration is configured and the tool arguments match the current MiniMax speech API.',
          };
        }
      },
    });
  }

  if (!allowedToolIds || allowedToolIds.has('minimax_image')) {
    tools.minimax_image = createTool({
      id: 'minimax_image',
      description:
        'Generate exactly one image file with MiniMax, save it into the workspace, and return the saved path.',
      inputSchema: z.object({
        prompt: z.string().min(1).describe('Text description of the image to generate.'),
        model: z.string().nullish().describe('MiniMax image model, for example image-01.'),
        aspect_ratio: imageAspectRatioSchema.nullish().describe('Preferred aspect ratio for the generated image.'),
        width: z.number().int().positive().nullish().describe('Explicit image width in pixels.'),
        height: z.number().int().positive().nullish().describe('Explicit image height in pixels.'),
      }),
      execute: async (input) => {
        try {
          const result = await minimax.generateImage({
            prompt: input.prompt,
            model: input.model ?? undefined,
            aspectRatio: input.aspect_ratio ?? undefined,
            width: input.width ?? undefined,
            height: input.height ?? undefined,
            imageCount: 1,
          });

          if (!result.success || !result.data) {
            return {
              valid: false,
              error: result.error?.message || 'Failed to generate image',
              hint: buildMiniMaxHint(
                result.error?.code,
                'Verify the MiniMax integration is configured and the selected image options are supported.',
              ),
            };
          }

          const paths = await Promise.all(
            result.data.images.map((base64Image, index) =>
              writeBufferToWorkspace(
                workspaceDir,
                'images',
                'png',
                Buffer.from(base64Image, 'base64'),
                index + 1,
              ),
            ),
          );

          return {
            valid: true,
            path: paths[0],
          };
        } catch (error) {
          return {
            valid: false,
            error: error instanceof Error ? error.message : 'Failed to generate image',
            hint: 'Verify the MiniMax integration is configured and the tool arguments match the current MiniMax image API.',
          };
        }
      },
    });
  }

  if (!allowedToolIds || allowedToolIds.has('minimax_video')) {
    tools.minimax_video = createTool({
      id: 'minimax_video',
      description:
        'Generate a video with MiniMax, wait for completion, save the video file into the workspace, and return the saved path.',
      inputSchema: z.object({
        prompt: z.string().min(1).describe('Text description of the video to generate.'),
        model: z.string().nullish().describe('MiniMax video model, for example MiniMax-Hailuo-2.3.'),
        duration: z.number().int().min(3).max(15).nullish().describe('Video duration in seconds.'),
        resolution: z.enum(['768P', '1080P']).nullish().describe('Output resolution.'),
        first_frame_image: z.string().url().nullish().describe('Optional first-frame image URL for image-to-video mode.'),
        last_frame_image: z.string().url().nullish().describe('Optional last-frame image URL for start-end-frame mode.'),
      }),
      execute: async (input) => {
        try {
          const task = await minimax.createVideoGenerationTask({
            prompt: input.prompt,
            model: input.model ?? undefined,
            duration: input.duration ?? undefined,
            resolution: input.resolution ?? undefined,
            firstFrameImage: input.first_frame_image ?? undefined,
            lastFrameImage: input.last_frame_image ?? undefined,
          });

          if (!task.success || !task.data) {
            return {
              valid: false,
              error: task.error?.message || 'Failed to start video generation',
              hint: buildMiniMaxHint(
                task.error?.code,
                'Verify the MiniMax integration is configured and the selected video options are supported.',
              ),
            };
          }

          const fileId = await waitForVideoFile(minimax, task.data.taskId);
          const file = await minimax.retrieveFile(fileId);

          if (!file.success || !file.data) {
            return {
              valid: false,
              error: file.error?.message || 'MiniMax did not return a downloadable video file',
              hint: 'The video task finished, but the file could not be retrieved. Try again in a moment.',
            };
          }

          const fileBuffer = await downloadFileBuffer(file.data.downloadUrl);
          const savedPath = await writeBufferToWorkspace(
            workspaceDir,
            'videos',
            inferExtensionFromUrl(file.data.downloadUrl, 'mp4'),
            fileBuffer,
          );

          return {
            valid: true,
            path: savedPath,
          };
        } catch (error) {
          return {
            valid: false,
            error: error instanceof Error ? error.message : 'Failed to generate video',
            hint: 'Verify the MiniMax integration is configured and the tool arguments match the current MiniMax video API.',
          };
        }
      },
    });
  }

  return tools;
}
