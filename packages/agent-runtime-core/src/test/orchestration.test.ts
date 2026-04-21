import { describe, expect, it } from 'vitest';

import { createNpcWorldApplication } from '../examples/applications/npc-world.js';
import { AgentRuntime } from '../core/runtime.js';
import { InMemoryWorldGateway } from '../examples/gateways/in-memory-world.js';
import { MultiAgentScene } from '../examples/orchestration/multi-agent-scene.js';
import { RealtimeVoiceAgent } from '../examples/orchestration/realtime-voice-agent.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('orchestration modules', () => {
  it('coordinates a realtime voice agent session', async () => {
    const transcripts: string[] = [];
    const agent = new RealtimeVoiceAgent({
      runtime: new AgentRuntime({
        runtimeId: 'voice-runtime',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'Hello from voice runtime' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      }),
      stt: {
        async createSession(options) {
          return {
            id: 'stt-session',
            async pushAudio() {
              await options?.onTranscription?.({
                id: 'transcript-1',
                text: 'viewer said hello',
                isFinal: true,
              });
              transcripts.push('viewer said hello');
            },
            async close() {},
          };
        },
      },
      tts: {
        async synthesize(request) {
          return {
            mimeType: 'audio/wav',
            bytes: new TextEncoder().encode(request.text),
          };
        },
      },
    });
    const session = await agent.startSession();

    await session.pushAudio({
      mimeType: 'audio/wav',
      bytes: new Uint8Array([1, 2, 3]),
    });
    const result = await session.runStepAndSpeak();

    expect(session.getTranscripts()).toEqual(['viewer said hello']);
    expect(transcripts).toEqual(['viewer said hello']);
    expect(result?.speech?.mimeType).toBe('audio/wav');
  });

  it('ticks a multi-agent scene through a shared world gateway', async () => {
    const world = new InMemoryWorldGateway();
    const agentA = createNpcWorldApplication({
      runtime: {
        runtimeId: 'npc-a',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'npc a acts' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      actorId: 'npc-a',
      world,
    });
    const agentB = createNpcWorldApplication({
      runtime: {
        runtimeId: 'npc-b',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'npc b acts' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      actorId: 'npc-b',
      world,
    });
    const scene = new MultiAgentScene({
      world,
      agents: [
        {
          runtimeId: 'npc-a',
          observeWorld: agentA.observeWorld,
          tick: agentA.tick,
        },
        {
          runtimeId: 'npc-b',
          observeWorld: agentB.observeWorld,
          tick: agentB.tick,
        },
      ],
    });

    await scene.broadcastEvent({
      id: 'event-1',
      type: 'market',
      text: 'A new order arrived in the market square.',
    });
    const results = await scene.tick();

    expect(results).toHaveLength(2);
    expect(results[0]?.steps).toHaveLength(1);
    expect(results[1]?.steps).toHaveLength(1);
  });
});
