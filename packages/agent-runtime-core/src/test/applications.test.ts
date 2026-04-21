import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAutonomousAgentApplication } from '../examples/applications/autonomous-agent.js';
import { createBrowserResearchApplication } from '../examples/applications/browser-research.js';
import { createNpcWorldApplication } from '../examples/applications/npc-world.js';
import { createStoryNarratorApplication } from '../examples/applications/story-narrator.js';
import { createVtuberApplication } from '../examples/applications/vtuber.js';
import { createWorkspaceAgentApplication } from '../examples/applications/workspace-agent.js';
import { createRuntimeHost } from '../integrations/hosts/runtime-host.js';
import { InMemoryWorldGateway } from '../examples/gateways/in-memory-world.js';
import { InMemoryRuntimeJournal } from '../integrations/journal/in-memory-runtime-journal.js';
import { InMemorySkillRegistry } from '../integrations/skills/in-memory-skill-registry.js';
import { InMemoryContextNoteStore } from '../integrations/state/context-note-store.js';
import { InMemoryStoryEventStore } from '../examples/domain/story/in-memory-story-event-store.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('application scaffolds', () => {
  it('creates an autonomous agent app with ticking support', async () => {
    const app = createAutonomousAgentApplication({
      runtime: {
        runtimeId: 'autonomous-app',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'tick handled' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
    });

    await app.runtime.dispatch({
      id: 'input-1',
      type: 'tick',
      payload: { value: 'tick' },
    });
    const result = await app.runtime.run();

    expect(result.steps).toHaveLength(1);
  });

  it('creates a story narrator app that records story events', async () => {
    const storyEvents = new InMemoryStoryEventStore();
    const app = createStoryNarratorApplication({
      runtime: {
        runtimeId: 'story-app',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'story beat' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      storyEvents,
    });

    await app.recordStoryEvent({
      id: 'story-1',
      text: 'The blacksmith reopened the shop.',
    });
    const result = await app.narrate();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.inputs[0]?.type).toBe('story-event');
    expect(await storyEvents.readRecent()).toHaveLength(1);
  });

  it('creates a vtuber app and performs latest step output', async () => {
    const avatarAnimations: string[] = [];
    let transcriptionHandler:
      | ((event: { id: string; text: string; isFinal: boolean; language?: string }) => Promise<void> | void)
      | undefined;
    const app = createVtuberApplication({
      runtime: {
        runtimeId: 'vtuber-app',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'Hello chat!' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      avatar: {
        async setExpression() {},
        async playAnimation(animation) {
          avatarAnimations.push(animation.name);
        },
        async move() {},
      },
      tts: {
        async synthesize(request) {
          return {
            mimeType: 'audio/wav',
            bytes: new TextEncoder().encode(request.text),
          };
        },
      },
      vision: {
        async analyze() {
          return { text: 'screen looks calm' };
        },
      },
      realtimeStt: {
        async createSession(options) {
          transcriptionHandler = options?.onTranscription;

          return {
            id: 'realtime-session-1',
            async pushAudio() {},
            async close() {},
          };
        },
      },
    });

    await app.receiveChatMessage({
      id: 'chat-1',
      author: 'viewer',
      text: 'Say hello',
    });
    await app.runtime.run();
    const performance = await app.performLatestStep();
    const realtimeSession = await app.startRealtimeVoiceSession();
    await transcriptionHandler?.({
      id: 'speech-1',
      text: 'hello from mic',
      isFinal: true,
      language: 'en',
    });

    expect(performance?.text).toBe('Hello chat!');
    expect(avatarAnimations).toEqual(['talk']);
    expect(realtimeSession?.getTranscripts()).toEqual(['hello from mic']);
  });

  it('creates an npc world app that consumes world events', async () => {
    const world = new InMemoryWorldGateway();
    const app = createNpcWorldApplication({
      runtime: {
        runtimeId: 'npc-app',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'npc acted' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      actorId: 'npc-1',
      world,
    });

    await app.emitWorldEvent({
      id: 'event-1',
      type: 'rumor',
      text: 'A caravan arrived.',
      actorId: 'npc-1',
    });
    await app.observeWorld();
    const result = await app.tick();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.inputs[0]?.type).toBe('world:rumor');
  });

  it('adds richer world actions to the npc app surface', async () => {
    const world = new InMemoryWorldGateway();
    const app = createNpcWorldApplication({
      runtime: {
        runtimeId: 'npc-world-actions',
        model: new FakeStepModelAdapter(() => ({
          segments: [],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      actorId: 'npc-1',
      world,
    });

    await app.emitWorldEvent({
      id: 'event-1',
      type: 'rumor',
      text: 'A caravan arrived.',
      actorId: 'npc-1',
    });

    const events = await app.readRecentEvents();
    await app.setRelationship({
      targetId: 'npc-2',
      kind: 'trust',
      value: 0.8,
      summary: 'Reliable trade partner',
    });
    const relationships = await app.readRelationshipsForActor();

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('rumor');
    expect(relationships).toHaveLength(1);
    expect(relationships[0]?.kind).toBe('trust');
  });

  it('creates a workspace agent app with workspace and skill support', async () => {
    const skills = new InMemorySkillRegistry();
    await skills.register({
      id: 'build-check',
      name: 'Build Check',
      description: 'Run the project build before shipping',
      instructions: 'Execute npm run build and inspect the output.',
    });
    const app = createWorkspaceAgentApplication({
      runtime: {
        runtimeId: 'workspace-app',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'workspace task handled' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      workspace: {
        async execute() {
          return {
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
          };
        },
      },
      skills,
    });

    const loadedSkills = await app.loadSkillNotes();
    const result = await app.runWorkspaceCommand({
      command: 'echo ok',
    });

    expect(loadedSkills).toHaveLength(1);
    expect(result.stdout).toBe('ok');
  });

  it('loads filesystem skills directly into the workspace agent notes', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-workspace-skills-'));
    const skillDir = join(basePath, 'review');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '# Review',
        '',
        'Review changes carefully before merging.',
      ].join('\n'),
      'utf8',
    );
    const app = createWorkspaceAgentApplication({
      runtime: {
        runtimeId: 'workspace-app-skills',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'workspace task handled' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      workspace: {
        async execute() {
          return {
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
          };
        },
      },
      skillBasePath: basePath,
    });

    const loadedSkills = await app.loadSkillNotes();

    expect(loadedSkills).toHaveLength(1);
    expect(loadedSkills[0]?.name).toBe('Review');
  });

  it('creates a browser research app that dispatches page snapshots', async () => {
    const app = createBrowserResearchApplication({
      runtime: {
        runtimeId: 'browser-app',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'page analyzed' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      browser: {
        async createSession() {
          return {
            id: 'session-1',
            async navigate() {},
            async click() {},
            async type() {},
            async snapshot() {
              return {
                url: 'https://example.com',
                title: 'Example',
                text: 'Example body',
              };
            },
            async screenshot() {
              return {
                mimeType: 'image/png',
                bytes: new Uint8Array([1]),
              };
            },
            async close() {},
          };
        },
      },
    });

    const snapshot = await app.inspectUrl({
      id: 'page-1',
      url: 'https://example.com',
    });
    const result = await app.run();

    expect(snapshot.title).toBe('Example');
    expect(result.steps[0]?.inputs[0]?.type).toBe('browser-page');
  });

  it('can close the shared browser session from the browser app surface', async () => {
    let closeCount = 0;
    const app = createBrowserResearchApplication({
      runtime: {
        runtimeId: 'browser-app-close',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'page analyzed' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      browser: {
        async createSession() {
          return {
            id: 'session-1',
            async navigate() {},
            async click() {},
            async type() {},
            async snapshot() {
              return {
                url: 'https://example.com',
                title: 'Example',
                text: 'Example body',
              };
            },
            async screenshot() {
              return {
                mimeType: 'image/png',
                bytes: new Uint8Array([1]),
              };
            },
            async close() {
              closeCount += 1;
            },
          };
        },
      },
    });

    await app.inspectUrl({
      id: 'page-1',
      url: 'https://example.com',
    });
    const closed = await app.closeSession();

    expect(closed).toBe(true);
    expect(closeCount).toBe(1);
  });

  it('can manage the vtuber reference browser session', async () => {
    let closeCount = 0;
    const app = createVtuberApplication({
      runtime: {
        runtimeId: 'vtuber-browser-app',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'hello' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      avatar: {
        async setExpression() {},
        async playAnimation() {},
        async move() {},
      },
      tts: {
        async synthesize(request) {
          return {
            mimeType: 'audio/wav',
            bytes: new TextEncoder().encode(request.text),
          };
        },
      },
      vision: {
        async analyze() {
          return { text: 'ok' };
        },
      },
      browser: {
        async createSession() {
          return {
            id: 'reference-session-1',
            async navigate() {},
            async click() {},
            async type() {},
            async snapshot() {
              return {
                url: 'https://example.com',
                title: 'Example',
                text: 'Example body',
              };
            },
            async screenshot() {
              return {
                mimeType: 'image/png',
                bytes: new Uint8Array([1]),
              };
            },
            async close() {
              closeCount += 1;
            },
          };
        },
      },
    });

    const snapshot = await app.openReferencePage('https://example.com');
    const secondSnapshot = await app.snapshotReferencePage();
    const closed = await app.closeReferencePage();

    expect(snapshot?.title).toBe('Example');
    expect(secondSnapshot?.url).toBe('https://example.com');
    expect(closed).toBe(true);
    expect(closeCount).toBe(1);
  });

  it('can queue and run a cycle in the autonomous app', async () => {
    const app = createAutonomousAgentApplication({
      runtime: {
        runtimeId: 'autonomous-cycle-app',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'cycle handled' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
    });

    await app.queueInput({
      id: 'input-1',
      type: 'manual',
      payload: { text: 'queued' },
    });
    const queuedResult = await app.runCycle();
    const inlineResult = await app.runCycle({
      id: 'input-2',
      type: 'manual',
      payload: { text: 'inline' },
    });

    expect(queuedResult.steps).toHaveLength(1);
    expect(inlineResult.steps).toHaveLength(1);
    expect(app.runtime.getSnapshot().steps).toHaveLength(2);
  });

  it('creates a runtime host with injected journal and notes stores', async () => {
    const journal = new InMemoryRuntimeJournal();
    const notes = new InMemoryContextNoteStore();
    const host = createRuntimeHost({
      runtime: {
        runtimeId: 'host-app',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'host handled input' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      journal,
      notes,
    });

    await host.runtime.dispatch({
      id: 'input-1',
      type: 'host-input',
      payload: { text: 'hello' },
    });
    await host.runtime.run();

    const snapshot = await journal.readSnapshot('host-app');

    expect(host.journal).toBe(journal);
    expect(host.notes).toBe(notes);
    expect(snapshot.steps).toHaveLength(1);
  });
});
