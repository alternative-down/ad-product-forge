import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createAutonomousAgentApplication } from '../examples/applications/autonomous-agent.js';
import { createBrowserResearchApplication } from '../examples/applications/browser-research.js';
import { createNpcWorldApplication } from '../examples/applications/npc-world.js';
import { createStoryNarratorApplication } from '../examples/applications/story-narrator.js';
import { createVtuberApplication } from '../examples/applications/vtuber.js';
import { createWorkspaceAgentApplication } from '../examples/applications/workspace-agent.js';
import { InMemoryWorldGateway } from '../examples/gateways/in-memory-world.js';
import { LocalBashWorkspaceGateway } from '../integrations/gateways/local-bash-workspace.js';
import { MultiAgentScene } from '../examples/orchestration/multi-agent-scene.js';
import { InMemorySkillRegistry } from '../integrations/skills/in-memory-skill-registry.js';
import {
  MiniMaxTextModelOptions,
  createMiniMaxTextModelAdapter,
} from '../integrations/providers/minimax-text.js';
import { MiniMaxTextToSpeechGateway } from '../integrations/providers/minimax-speech.js';

const apiKey = process.env.MINIMAX_API_KEY;

if (!apiKey) {
  throw new Error('MINIMAX_API_KEY is required');
}

const outputDir = join(process.cwd(), 'tmp', 'application-validation');
await mkdir(outputDir, { recursive: true });

const sharedModelOptions: MiniMaxTextModelOptions = {
  apiKey,
  modelId: 'MiniMax-M2.7',
  system: 'Be concise and literal.',
  temperature: 0.2,
};

const autonomous = createAutonomousAgentApplication({
  runtime: {
    runtimeId: 'autonomous-validation',
    model: createMiniMaxTextModelAdapter(sharedModelOptions),
  },
});
await autonomous.runtime.dispatch({
  id: 'auto-1',
  type: 'tick',
  payload: { text: 'A maintenance cycle should be acknowledged.' },
});
const autonomousResult = await autonomous.runtime.run({ maxSteps: 1 });

const narrator = createStoryNarratorApplication({
  runtime: {
    runtimeId: 'narrator-validation',
    model: createMiniMaxTextModelAdapter(sharedModelOptions),
  },
});
await narrator.recordStoryEvent({
  id: 'story-1',
  text: 'Narrate this event in one sentence for a village chronicle: the forge reopened at dawn after the caravan reached the village.',
});
const narratorResult = await narrator.narrate({ maxSteps: 1 });

const vtuberAudioPath = join(outputDir, 'vtuber.mp3');
const vtuber = createVtuberApplication({
  runtime: {
    runtimeId: 'vtuber-validation',
    model: createMiniMaxTextModelAdapter(sharedModelOptions),
  },
  avatar: {
    async setExpression() {},
    async playAnimation() {},
    async move() {},
  },
  tts: new MiniMaxTextToSpeechGateway({ apiKey }),
  vision: {
    async analyze() {
      return {
        text: 'A code editor and terminal are visible on screen.',
      };
    },
  },
});
await vtuber.receiveChatMessage({
  id: 'chat-1',
  author: 'viewer',
  text: 'Greet the stream briefly.',
});
await vtuber.runtime.run({ maxSteps: 1 });
const vtuberPerformance = await vtuber.performLatestStep();

if (vtuberPerformance?.audio) {
  await writeFile(vtuberAudioPath, vtuberPerformance.audio.bytes);
}

const workspace = createWorkspaceAgentApplication({
  runtime: {
    runtimeId: 'workspace-validation',
    model: createMiniMaxTextModelAdapter(sharedModelOptions),
  },
  workspace: new LocalBashWorkspaceGateway(),
  skills: await createValidationSkillRegistry(),
});
await workspace.loadSkillNotes();
await workspace.queueTask({
  id: 'workspace-1',
  text: 'Check the current package name in package.json.',
  cwd: process.cwd(),
});
const workspaceCommand = await workspace.runWorkspaceCommand({
  command: 'node -p "require(\'./package.json\').name"',
  cwd: process.cwd(),
});
const workspaceResult = await workspace.run({ maxSteps: 1 });

const browserResearch = createBrowserResearchApplication({
  runtime: {
    runtimeId: 'browser-validation',
    model: createMiniMaxTextModelAdapter(sharedModelOptions),
  },
  browser: {
    async createSession() {
      return {
        id: 'browser-session',
        async navigate() {},
        async click() {},
        async type() {},
        async snapshot() {
          return {
            url: 'https://example.com',
            title: 'Example Domain',
            text: 'Example Domain. This domain is for use in illustrative examples.',
          };
        },
        async screenshot() {
          return {
            mimeType: 'image/png',
            bytes: new Uint8Array([1, 2, 3]),
          };
        },
        async close() {},
      };
    },
  },
});
await browserResearch.inspectUrl({
  id: 'browser-1',
  url: 'https://example.com',
});
await browserResearch.queueResearchTask({
  id: 'browser-2',
  text: 'Summarize the inspected page in one sentence.',
});
const browserResult = await browserResearch.run({ maxSteps: 1 });

const world = new InMemoryWorldGateway();
const npcA = createNpcWorldApplication({
  runtime: {
    runtimeId: 'npc-a-validation',
    model: createMiniMaxTextModelAdapter(sharedModelOptions),
  },
  actorId: 'npc-a',
  world,
});
const npcB = createNpcWorldApplication({
  runtime: {
    runtimeId: 'npc-b-validation',
    model: createMiniMaxTextModelAdapter(sharedModelOptions),
  },
  actorId: 'npc-b',
  world,
});
const scene = new MultiAgentScene({
  world,
  agents: [
    {
      runtimeId: 'npc-a',
      observeWorld: npcA.observeWorld,
      tick: npcA.tick,
    },
    {
      runtimeId: 'npc-b',
      observeWorld: npcB.observeWorld,
      tick: npcB.tick,
    },
  ],
});
await scene.broadcastEvent({
  id: 'world-1',
  type: 'rumor',
  text: 'React in one sentence to this rumor: a new order of iron ingots was placed in town.',
});
const sceneResults = await scene.tick({ perAgentMaxSteps: 1 });

console.log(
  JSON.stringify(
    {
      autonomous: summarizeStepResult(autonomousResult.steps[0]?.modelResponse.segments),
      narrator: summarizeStepResult(narratorResult.steps[0]?.modelResponse.segments),
      vtuber: {
        text: vtuberPerformance?.text ?? null,
        audioFile: vtuberPerformance?.audio ? vtuberAudioPath : null,
      },
      workspace: {
        commandStdout: workspaceCommand.stdout.trim(),
        modelText: summarizeStepResult(workspaceResult.steps[0]?.modelResponse.segments),
      },
      browser: summarizeStepResult(browserResult.steps[0]?.modelResponse.segments),
      npcScene: sceneResults.map((result) =>
        summarizeStepResult(result.steps[0]?.modelResponse.segments),
      ),
    },
    null,
    2,
  ),
);

function summarizeStepResult(segments: Array<{ kind: string; text: string }> | undefined) {
  return (
    segments
      ?.filter((segment) => segment.text.trim().length > 0)
      .map((segment) => segment.text)
      .join('\n')
      .trim() ?? null
  );
}

async function createValidationSkillRegistry() {
  const registry = new InMemorySkillRegistry();

  await registry.register({
    id: 'package-inspection',
    name: 'Package Inspection',
    description: 'Inspect package.json fields from the current workspace.',
    instructions: 'Use node -p or jq to read package.json fields directly.',
  });

  return registry;
}
