import type { AgentRuntimeOptions } from '../../core/runtime.js';
import type { AvatarGateway } from '../../integrations/gateways/avatar.js';
import type { BrowserGateway } from '../../integrations/gateways/browser.js';
import type {
  RealtimeSpeechToTextGateway,
  TextToSpeechGateway,
} from '../../integrations/gateways/speech.js';
import type { VisionGateway } from '../../integrations/gateways/vision.js';
import { z } from 'zod';

import { RealtimeVoiceAgent } from '../orchestration/realtime-voice-agent.js';
import { createRuntimeHost } from '../../integrations/hosts/runtime-host.js';

export type VtuberApplicationOptions = {
  runtime: AgentRuntimeOptions;
  avatar: AvatarGateway;
  tts: TextToSpeechGateway;
  vision: VisionGateway;
  browser?: BrowserGateway;
  realtimeStt?: RealtimeSpeechToTextGateway;
};

export function createVtuberApplication(options: VtuberApplicationOptions) {
  const host = createRuntimeHost({
    runtime: options.runtime,
  });
  let referenceSessionPromise: Promise<
    Awaited<ReturnType<BrowserGateway['createSession']>>
  > | null = null;

  const getReferenceSession = async () => {
    if (!options.browser) {
      throw new Error('VTuber application requires a browser gateway for reference browsing');
    }

    if (!referenceSessionPromise) {
      referenceSessionPromise = options.browser.createSession();
    }

    return referenceSessionPromise;
  };

  host.runtime.registerAction({
    name: 'avatar_set_expression',
    description: 'Set the VTuber avatar expression.',
    inputSchema: z.object({
      name: z.string().min(1),
      intensity: z.number().optional(),
    }),
    execute(input) {
      return options.avatar.setExpression(input);
    },
  });
  host.runtime.registerAction({
    name: 'avatar_play_animation',
    description: 'Play an avatar animation clip.',
    inputSchema: z.object({
      name: z.string().min(1),
      loop: z.boolean().optional(),
    }),
    execute(input) {
      return options.avatar.playAnimation(input);
    },
  });
  host.runtime.registerAction({
    name: 'avatar_move',
    description: 'Move the avatar in 2D or 3D space.',
    inputSchema: z.object({
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
      speed: z.number().optional(),
    }),
    execute(input) {
      return options.avatar.move(input);
    },
  });
  host.runtime.registerAction({
    name: 'vision_analyze',
    description: 'Analyze one or more images and return a textual vision summary.',
    inputSchema: z.object({
      prompt: z.string().optional(),
      images: z
        .array(
          z.object({
            mimeType: z.string().min(1),
            bytes: z.array(z.number().int().min(0).max(255)),
          }),
        )
        .min(1),
    }),
    execute(input) {
      return options.vision.analyze({
        prompt: input.prompt,
        images: input.images.map((image) => ({
          mimeType: image.mimeType,
          bytes: Uint8Array.from(image.bytes),
        })),
      });
    },
  });
  host.runtime.registerAction({
    name: 'tts_speak',
    description: 'Synthesize audio for a VTuber line.',
    inputSchema: z.object({
      text: z.string().min(1),
      voiceId: z.string().optional(),
    }),
    execute(input) {
      return options.tts.synthesize(input);
    },
  });
  if (options.browser) {
    host.runtime.registerAction({
      name: 'browser_open_reference',
      description: 'Open the VTuber reference browser and navigate to a URL.',
      inputSchema: z.object({
        url: z.string().url(),
      }),
      async execute(input) {
        const session = await getReferenceSession();
        await session.navigate(input.url);
        return session.snapshot();
      },
    });
    host.runtime.registerAction({
      name: 'browser_snapshot_reference',
      description: 'Read the current reference browser snapshot.',
      inputSchema: z.object({}),
      async execute() {
        const session = await getReferenceSession();
        return session.snapshot();
      },
    });
    host.runtime.registerAction({
      name: 'browser_close_reference',
      description: 'Close the VTuber reference browser session.',
      inputSchema: z.object({}),
      async execute() {
        if (!referenceSessionPromise) {
          return { closed: false };
        }

        const session = await referenceSessionPromise;
        await session.close();
        referenceSessionPromise = null;
        return { closed: true };
      },
    });
  }

  return {
    runtime: host.runtime,
    journal: host.journal,
    notes: host.notes,
    async receiveChatMessage(message: { id: string; author: string; text: string }) {
      await host.runtime.dispatch({
        id: message.id,
        type: 'chat-message',
        payload: message,
      });
    },
    async observeVision(input: {
      id: string;
      prompt?: string;
      images: Array<{ mimeType: string; bytes: Uint8Array }>;
    }) {
      const analysis = await options.vision.analyze({
        prompt: input.prompt,
        images: input.images,
      });

      await host.runtime.dispatch({
        id: input.id,
        type: 'vision-observation',
        payload: analysis,
      });
    },
    async speakText(text: string, voiceId?: string) {
      await options.avatar.playAnimation({
        name: 'talk',
      });

      return options.tts.synthesize({
        text,
        voiceId,
      });
    },
    async performLatestStep() {
      const latestStep = host.runtime.getSnapshot().steps.at(-1);

      if (!latestStep) {
        return null;
      }

      const spokenText = latestStep.modelResponse.segments
        .filter((segment) => segment.kind === 'message')
        .map((segment) => segment.text)
        .join('\n');

      if (!spokenText.trim()) {
        return null;
      }

      await options.avatar.playAnimation({
        name: 'talk',
      });
      const speech = await options.tts.synthesize({
        text: spokenText,
      });

      return {
        text: spokenText,
        audio: speech,
      };
    },
    async startRealtimeVoiceSession(language?: string) {
      if (!options.realtimeStt) {
        return null;
      }

      const voiceAgent = new RealtimeVoiceAgent({
        runtime: host.runtime,
        stt: options.realtimeStt,
        tts: options.tts,
        avatar: options.avatar,
        language,
      });

      return voiceAgent.startSession();
    },
    async openReferencePage(url: string) {
      if (!options.browser) {
        return;
      }

      const session = await getReferenceSession();
      await session.navigate(url);
      return session.snapshot();
    },
    async snapshotReferencePage() {
      if (!options.browser) {
        return null;
      }

      const session = await getReferenceSession();

      return session.snapshot();
    },
    async closeReferencePage() {
      if (!referenceSessionPromise) {
        return false;
      }

      const session = await referenceSessionPromise;
      await session.close();
      referenceSessionPromise = null;
      return true;
    },
  };
}
