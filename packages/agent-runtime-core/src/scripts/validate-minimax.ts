import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AgentRuntime } from '../core/runtime.js';
import { MiniMaxImageGenerationGateway } from '../integrations/providers/minimax-image.js';
import { MiniMaxTextToSpeechGateway } from '../integrations/providers/minimax-speech.js';
import { createMiniMaxTextModelAdapter } from '../integrations/providers/minimax-text.js';

const apiKey = process.env.MINIMAX_API_KEY;

if (apiKey == null) {
  throw new Error('MINIMAX_API_KEY is required');
}

const outputDir = join(process.cwd(), 'tmp', 'minimax-validation');
await mkdir(outputDir, { recursive: true });

const runtime = new AgentRuntime({
  runtimeId: 'minimax-validation-runtime',
  model: createMiniMaxTextModelAdapter({
    apiKey,
    modelId: 'MiniMax-M2.7',
    system: 'Answer briefly and clearly.',
    temperature: 0.3,
  }),
});

await runtime.dispatch({
  id: 'validation-input-1',
  type: 'validation',
  payload: {
    text: 'Say hello from MiniMax runtime validation.',
  },
});
const textResult = await runtime.run({ maxSteps: 1 });
const step = textResult.steps[0];

if (step == null) {
  throw new Error('MiniMax text validation produced no step');
}

const spokenText = step.modelResponse.segments
  .filter((segment) => segment.kind === 'message')
  .map((segment) => segment.text)
  .join('\n')
  .trim();

if (!spokenText) {
  throw new Error('MiniMax text validation produced no assistant text');
}

const tts = new MiniMaxTextToSpeechGateway({ apiKey });
const speech = await tts.synthesize({
  text: spokenText,
});
await writeFile(join(outputDir, 'tts.mp3'), speech.bytes);

const imageGateway = new MiniMaxImageGenerationGateway({ apiKey });
const imageResult = await imageGateway.generate({
  prompt: 'A warm anime-inspired blacksmith workshop interior, morning light, highly detailed',
  aspectRatio: '1:1',
});
const firstImage = imageResult.images[0];

if (firstImage == null) {
  throw new Error('MiniMax image validation produced no images');
}

await writeFile(join(outputDir, 'image.jpg'), firstImage.bytes);

console.log(
  JSON.stringify(
    {
      text: {
        stepId: step.id,
        text: spokenText,
        usage: step.modelUsage,
        metadata: step.modelMetadata,
      },
      tts: {
        mimeType: speech.mimeType,
        bytes: speech.bytes.length,
        file: join(outputDir, 'tts.mp3'),
      },
      image: {
        mimeType: firstImage.mimeType,
        bytes: firstImage.bytes.length,
        file: join(outputDir, 'image.jpg'),
        count: imageResult.images.length,
      },
    },
    null,
    2,
  ),
);
