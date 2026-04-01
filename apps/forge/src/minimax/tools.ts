import { createTool } from '@mastra/core/tools';
import path from 'node:path';
import { z } from 'zod';

import type { MiniMaxManager } from './manager';

export const MINIMAX_TOOL_IDS = [
  'list_minimax_voices',
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

const languageBoostSchema = z.enum([
  'Chinese',
  'Chinese,Yue',
  'English',
  'Arabic',
  'Russian',
  'Spanish',
  'French',
  'Portuguese',
  'German',
  'Turkish',
  'Dutch',
  'Ukrainian',
  'Vietnamese',
  'Indonesian',
  'Japanese',
  'Italian',
  'Korean',
  'Thai',
  'Polish',
  'Romanian',
  'Greek',
  'Czech',
  'Finnish',
  'Hindi',
  'Bulgarian',
  'Danish',
  'Hebrew',
  'Malay',
  'Persian',
  'Slovak',
  'Swedish',
  'Croatian',
  'Filipino',
  'Hungarian',
  'Norwegian',
  'Slovenian',
  'Catalan',
  'Nynorsk',
  'Tamil',
  'Afrikaans',
  'auto',
]);

const voiceTypeSchema = z.enum(['system', 'voice_cloning', 'voice_generation', 'all']);

function createMiniMaxOutputPath(
  kind: 'tts' | 'images' | 'videos',
  extension: string,
  index?: number,
) {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  const fileName = index === undefined
    ? `${kind}-${timestamp}-${suffix}.${extension}`
    : `${kind}-${timestamp}-${suffix}-${index}.${extension}`;
  return path.posix.join(MINIMAX_OUTPUT_DIRECTORY, kind, fileName);
}

async function writeBufferToWorkspace(
  workspace: { filesystem?: { writeFile(path: string, content: Uint8Array): Promise<unknown> } } | undefined,
  kind: 'tts' | 'images' | 'videos',
  extension: string,
  buffer: Buffer,
  index?: number,
) {
  const filesystem = workspace?.filesystem;

  if (!filesystem) {
    throw new Error('MiniMax tools require a workspace filesystem');
  }

  const outputPath = createMiniMaxOutputPath(kind, extension, index);
  await filesystem.writeFile(outputPath, new Uint8Array(buffer));
  return outputPath;
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
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};

  if (!allowedToolIds || allowedToolIds.has('list_minimax_voices')) {
    tools.list_minimax_voices = createTool({
      id: 'list_minimax_voices',
      description:
        'List MiniMax voices available for TTS. Use this before minimax_tts when you want to choose a voiceId instead of using the default voice.',
      inputSchema: z.object({
        voice_type: voiceTypeSchema.default('system').describe('Which voices to list. Use "system" for built-in voices, "voice_cloning" for cloned voices, "voice_generation" for generated voices, or "all" for everything.'),
      }),
      execute: async (input) => {
        try {
          const result = await minimax.listVoices(input.voice_type);

          if (!result.success || !result.data) {
            return {
              valid: false,
              error: result.error?.message || 'Failed to list voices',
              hint: 'Verify the MiniMax integration is configured and try again.',
            };
          }

          return {
            valid: true,
            voiceType: input.voice_type,
            ...result.data,
          };
        } catch (error) {
          return {
            valid: false,
            error: error instanceof Error ? error.message : 'Failed to list voices',
            hint: 'Verify the MiniMax integration is configured and the voice list API is available.',
          };
        }
      },
    });
  }

  if (!allowedToolIds || allowedToolIds.has('minimax_tts')) {
    tools.minimax_tts = createTool({
      id: 'minimax_tts',
      description:
        'Turn text into a speech audio file with MiniMax. You can use plain text, newline breaks between paragraphs, pause markers like <#1.5#>, and interjection tags such as (laughs) or (sighs) when using the 2.8 speech models. The generated file is saved in your workspace and the tool returns the saved path.',
      inputSchema: z.object({
        text: z.string().min(1).describe('The text to speak. Keep it under 10,000 characters. Use newline breaks for paragraphs, pause markers like <#1.5#> for pauses in seconds, and interjection tags like (laughs), (sighs), or (coughs) when you want those effects.'),
        voice_id: z.string().nullish().describe('Optional voiceId. If omitted, the default voice is English_expressive_narrator. Use list_minimax_voices if you want to choose another voice.'),
        speed: z.number().nullish().describe('Optional speaking speed. Default is 1.'),
        volume: z.number().nullish().describe('Optional voice volume. Default is 1.'),
        pitch: z.number().nullish().describe('Optional voice pitch. Default is 0.'),
        language_boost: languageBoostSchema.nullish().describe('Optional language hint. Use this when the text is in a specific language or dialect, or use auto when the language is mixed or uncertain.'),
        pronunciation_tone_replacements: z.array(z.string().min(1)).nullish().describe('Optional pronunciation replacements in the form "original/replacement", for example "Omg/Oh my god".'),
        output_format: z.enum(['mp3', 'wav', 'flac']).nullish().describe('Audio format for the saved file. Default is mp3.'),
      }),
      execute: async (input, context) => {
        try {
          const result = await minimax.textToSpeech({
            text: input.text,
            voiceSetting: {
              voiceId: input.voice_id ?? 'English_expressive_narrator',
              speed: input.speed ?? undefined,
              volume: input.volume ?? undefined,
              pitch: input.pitch ?? undefined,
            },
            languageBoost: input.language_boost ?? undefined,
            pronunciationToneReplacements: input.pronunciation_tone_replacements ?? undefined,
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
            context.workspace,
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
        'Generate one image with MiniMax. The image is saved in your workspace and the tool returns the saved path.',
      inputSchema: z.object({
        prompt: z.string().min(1).describe('Describe the image you want MiniMax to generate.'),
        model: z.string().nullish().describe('Optional MiniMax image model to use. Omit this unless you need a specific model.'),
        aspect_ratio: imageAspectRatioSchema.nullish().describe('Optional aspect ratio for the image.'),
        width: z.number().int().positive().nullish().describe('Optional image width in pixels.'),
        height: z.number().int().positive().nullish().describe('Optional image height in pixels.'),
      }),
      execute: async (input, context) => {
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
                context.workspace,
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
        'Generate a video with MiniMax. The tool waits for the generation to finish, saves the video in your workspace, and returns the saved path.',
      inputSchema: z.object({
        prompt: z.string().min(1).describe('Describe the video you want MiniMax to generate.'),
        model: z.string().nullish().describe('Optional MiniMax video model to use. Omit this unless you need a specific model.'),
        duration: z.number().int().min(3).max(15).nullish().describe('Optional duration in seconds.'),
        resolution: z.enum(['768P', '1080P']).nullish().describe('Optional output resolution.'),
        first_frame_image: z.string().url().nullish().describe('Optional image URL to use as the first frame.'),
        last_frame_image: z.string().url().nullish().describe('Optional image URL to use as the last frame.'),
      }),
      execute: async (input, context) => {
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
            context.workspace,
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
