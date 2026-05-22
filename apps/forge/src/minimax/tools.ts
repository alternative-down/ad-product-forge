import { createTool, forgeDebug } from '@forge-runtime/core';
import path from 'node:path';
import { z } from 'zod';

import type { MiniMaxManager } from './manager';

/** Context shape expected by MiniMax tools (injected by forge runtime). */
interface MiniMaxToolContext {
  workspace: { filesystem?: { writeFile(path: string, content: Uint8Array): Promise<unknown>; readFile(path: string): Promise<Uint8Array | string> } };
}

const __MINIMAX_TOOL_IDS = [
  'list_minimax_voices',
  'minimax_tts',
  'minimax_image',
  'minimax_video',
] as const;

type MiniMaxToolId = (typeof __MINIMAX_TOOL_IDS)[number];

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
import { serializeError } from '../agents/agent-runner-error-formatting';

const imageAspectRatioSchema = z.enum(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']);

const imageReferenceTypeSchema = z.enum(['character']);

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

function resolveImageContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return null;
  }
}

function createMiniMaxOutputPath(
  kind: 'tts' | 'images' | 'videos',
  extension: string,
  index?: number,
) {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  const fileName =
    index === undefined
      ? `${kind}-${timestamp}-${suffix}.${extension}`
      : `${kind}-${timestamp}-${suffix}-${index}.${extension}`;
  return path.posix.join(MINIMAX_OUTPUT_DIRECTORY, kind, fileName);
}

async function writeBufferToWorkspace(
  workspace:
    | { filesystem?: { writeFile(path: string, content: Uint8Array): Promise<unknown> } }
    | undefined,
  kind: 'tts' | 'images' | 'videos',
  extension: string,
  buffer: Buffer,
  index?: number,
) {
  const filesystem = workspace?.filesystem;

  if (!filesystem) {
    forgeDebug({
      scope: 'minimax',
      level: 'error',
      message: 'minimax-tools: validation/requirement failed',
    });
    throw new Error('MiniMax tools require a workspace filesystem');
  }

  const outputPath = createMiniMaxOutputPath(kind, extension, index);
  await filesystem.writeFile(outputPath, new Uint8Array(buffer));
  return outputPath;
}

async function downloadFileBuffer(downloadUrl: string) {
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    forgeDebug({
      scope: 'minimax',
      level: 'error',
      message: 'downloadFileBuffer HTTP failure',
      context: { status: response.status, downloadUrl },
    });
    throw new Error(`MiniMax file download failed with status ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function readWorkspaceImageAsDataUrl(
  workspace: { filesystem?: { readFile(path: string): Promise<Uint8Array | string> } } | undefined,
  filePath: string,
) {
  const filesystem = workspace?.filesystem;

  if (!filesystem) {
    forgeDebug({
      scope: 'minimax',
      level: 'error',
      message: 'minimax-tools: validation/requirement failed',
    });
    throw new Error('MiniMax tools require a workspace filesystem');
  }

  const data = await filesystem.readFile(filePath);
  const buffer = Buffer.from(typeof data === 'string' ? data : data);
  const mimeType = resolveImageContentType(filePath);

  if (!mimeType || !mimeType.startsWith('image/')) {
    forgeDebug({
      scope: 'minimax',
      level: 'error',
      message: 'minimax-tools: validation/requirement failed',
    });
    throw new Error(`Reference image must be an image file: ${filePath}`);
  }

  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function inferExtensionFromUrl(downloadUrl: string, fallback: string) {
  const pathname = new URL(downloadUrl).pathname;
  const extension = path.extname(pathname).replace('.', '');
  return extension || fallback;
}

async function waitForVideoFile(minimax: MiniMaxManager, taskId: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await minimax.queryVideoGeneration(taskId);

    if (!status.success) {
      forgeDebug({
        scope: 'minimax',
        level: 'error',
        message: 'minimax-tools: validation/requirement failed',
      });
      throw new Error(status.error?.message ?? 'Failed to query MiniMax video generation status');
    }

    const videoStatus = status.data?.status?.toLowerCase() ?? '';

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (videoStatus === 'success' && status.data?.fileId) {
      return status.data.fileId;
    }

    if (videoStatus === 'failed') {
      forgeDebug({
        scope: 'minimax',
        level: 'error',
        message: 'minimax-tools: validation/requirement failed',
      });
      throw new Error(status.data?.failureReason ?? 'MiniMax video generation failed');
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  forgeDebug({
    scope: 'minimax',
    level: 'error',
    message: 'minimax-tools: validation/requirement failed',
  });
  throw new Error('MiniMax video generation did not finish within the expected time window');
}

export function createMiniMaxTools(minimax: MiniMaxManager, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};
  const videoToolEnabled = false;

  if (!allowedToolIds || allowedToolIds.has('list_minimax_voices')) {
    tools.list_minimax_voices = createTool({
      id: 'list_minimax_voices',
      description:
        'List MiniMax voices available for TTS. Use this before minimax_tts when you want to choose a voiceId instead of using the default voice.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const result = await minimax.listVoices('all');

          if (!result.success || !result.data) {
            return {
              valid: false,
              error: result.error?.message ?? 'Failed to list voices',
              hint: 'Verify the MiniMax integration is configured and try again.',
            };
          }

          return {
            valid: true,
            voiceType: 'all',
            ...result.data,
          };
        } catch (error) {
          forgeDebug({
            scope: 'minimax',
            level: 'error',
            message: 'MiniMax tool failed',
            context: { error: String(serializeError(error)) },
          });
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
        text: z
          .string()
          .min(1)
          .describe(
            'The text to speak. Keep it under 10,000 characters. Use newline breaks for paragraphs, pause markers like <#1.5#> for pauses in seconds, and interjection tags like (laughs), (sighs), or (coughs) when you want those effects.',
          ),
        voice_id: z
          .string()
          .optional()
          .describe(
            'Optional voiceId. If omitted, the default voice is Portuguese_CaptivatingStoryteller. Use list_minimax_voices if you want to choose another voice.',
          ),
        speed: z.number().optional().describe('Optional speaking speed. Default is 1.'),
        volume: z.number().optional().describe('Optional voice volume. Default is 1.'),
        pitch: z.number().optional().describe('Optional voice pitch. Default is 0.'),
        language_boost: languageBoostSchema
          .optional()
          .describe(
            'Optional language hint. Use this when the text is in a specific language or dialect, or use auto when the language is mixed or uncertain.',
          ),
        pronunciation_tone_replacements: z
          .array(z.string().min(1))
          .optional()
          .describe(
            'Optional pronunciation replacements in the form "original/replacement", for example "Omg/Oh my god".',
          ),
        output_format: z
          .enum(['mp3', 'wav', 'flac'])
          .optional()
          .describe('Audio format for the saved file. Default is mp3.'),
      }),
      execute: async (input, context) => {
        try {
          const result = await minimax.textToSpeech({
            text: input.text,
            voiceSetting: {
              voiceId: input.voice_id ?? 'Portuguese_CaptivatingStoryteller',
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
              error: result.error?.message ?? 'Failed to generate speech',
              hint: buildMiniMaxHint(
                result.error?.code,
                'Verify the MiniMax integration is configured and the selected speech options are supported.',
              ),
            };
          }

          const audioBuffer = Buffer.from(result.data.audioHex, 'hex');
          const savedPath = await writeBufferToWorkspace(
            (context as unknown as MiniMaxToolContext).workspace,
            'tts',
            result.data.audioFormat,
            audioBuffer,
          );

          return {
            valid: true,
            path: savedPath,
          };
        } catch (error) {
          forgeDebug({
            scope: 'minimax',
            level: 'error',
            message: 'MiniMax tool failed',
            context: { error: String(serializeError(error)) },
          });
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
        'Generate one image with MiniMax. You can use prompt-only generation or pass one or more reference images. Reference images can be public URLs or image paths from your workspace. The generated image is saved in your workspace and the tool returns the saved path.',
      inputSchema: z.object({
        prompt: z.string().min(1).describe('Describe the image you want MiniMax to generate.'),
        model: z
          .string()
          .optional()
          .describe(
            'Optional MiniMax image model to use. Omit this unless you need a specific model.',
          ),
        aspect_ratio: imageAspectRatioSchema
          .optional()
          .describe('Optional aspect ratio for the image.'),
        width: z.number().int().positive().optional().describe('Optional image width in pixels.'),
        height: z.number().int().positive().optional().describe('Optional image height in pixels.'),
        reference_type: imageReferenceTypeSchema
          .optional()
          .describe('Optional reference type for subject reference. Default is character.'),
        reference_images: z
          .array(z.string().min(1))
          .optional()
          .describe(
            'Optional reference images. Each item can be a public URL or a path to an image inside your workspace.',
          ),
      }),
      execute: async (input, context) => {
        try {
          const subjectReference = input.reference_images
            ? await Promise.all(
                input.reference_images.map(async (referenceImage: string) => ({
                  type: input.reference_type ?? 'character',
                  imageFile: /^https?:\/\//i.test(referenceImage)
                    ? referenceImage
                    : await readWorkspaceImageAsDataUrl((context as unknown as MiniMaxToolContext).workspace, referenceImage),
                })),
              )
            : undefined;

          const result = await minimax.generateImage({
            prompt: input.prompt,
            model: input.model ?? undefined,
            aspectRatio: input.aspect_ratio ?? undefined,
            width: input.width ?? undefined,
            height: input.height ?? undefined,
            imageCount: 1,
            subjectReference,
          });

          if (!result.success || !result.data) {
            return {
              valid: false,
              error: result.error?.message ?? 'Failed to generate image',
              hint: buildMiniMaxHint(
                result.error?.code,
                'Verify the MiniMax integration is configured and the selected image options are supported.',
              ),
            };
          }

          const paths = await Promise.all(
            result.data.images.map((base64Image, index) =>
              writeBufferToWorkspace(
                (context as unknown as MiniMaxToolContext).workspace,
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
          forgeDebug({
            scope: 'minimax',
            level: 'error',
            message: 'MiniMax tool failed',
            context: { error: String(serializeError(error)) },
          });
          return {
            valid: false,
            error: error instanceof Error ? error.message : 'Failed to generate image',
            hint: 'Verify the MiniMax integration is configured and the tool arguments match the current MiniMax image API.',
          };
        }
      },
    });
  }

  if (videoToolEnabled && (!allowedToolIds || allowedToolIds.has('minimax_video'))) {
    tools.minimax_video = createTool({
      id: 'minimax_video',
      description:
        'Generate a video with MiniMax. The tool waits for the generation to finish, saves the video in your workspace, and returns the saved path.',
      inputSchema: z.object({
        prompt: z.string().min(1).describe('Describe the video you want MiniMax to generate.'),
        model: z
          .string()
          .optional()
          .describe(
            'Optional MiniMax video model to use. Omit this unless you need a specific model.',
          ),
        duration: z
          .number()
          .int()
          .min(3)
          .max(15)
          .optional()
          .describe('Optional duration in seconds.'),
        resolution: z.enum(['768P', '1080P']).optional().describe('Optional output resolution.'),
        first_frame_image: z
          .string()
          .url()
          .optional()
          .describe('Optional image URL to use as the first frame.'),
        last_frame_image: z
          .string()
          .url()
          .optional()
          .describe('Optional image URL to use as the last frame.'),
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
              error: task.error?.message ?? 'Failed to start video generation',
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
              error: file.error?.message ?? 'MiniMax did not return a downloadable video file',
              hint: 'The video task finished, but the file could not be retrieved. Try again in a moment.',
            };
          }

          const fileBuffer = await downloadFileBuffer(file.data.downloadUrl ?? '');
          const savedPath = await writeBufferToWorkspace(
            (context as unknown as MiniMaxToolContext).workspace,
            'videos',
            inferExtensionFromUrl(file.data.downloadUrl ?? '', 'mp4'),
            fileBuffer,
          );

          return {
            valid: true,
            path: savedPath,
          };
        } catch (error) {
          forgeDebug({
            scope: 'minimax',
            level: 'error',
            message: 'MiniMax tool failed',
            context: { error: String(serializeError(error)) },
          });
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
