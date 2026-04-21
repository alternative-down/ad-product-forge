import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ForgeMcpToolset,
  InMemoryForgeUsageSink,
  createStep,
  createTool,
  createWorkflow,
  forgeDebug,
  isForgeDebugEnabled,
  resolveWorkspaceEmbedderId,
  toForgeSafeIdentifier,
  toolsToRuntimeActions,
  workflowsToTools,
} from './index.js';

describe('@forge-runtime/core', () => {
  it('exports identifier and debug helpers', () => {
    expect(toForgeSafeIdentifier('Meraxis Runtime')).toBe('Meraxis_Runtime');
    expect(typeof forgeDebug).toBe('function');
    expect(typeof isForgeDebugEnabled()).toBe('boolean');
  });

  it('exports runtime-facing helpers', () => {
    expect(resolveWorkspaceEmbedderId('transformers-multilingual-e5-small')).toBe('transformers-multilingual-e5-small');
    expect(resolveWorkspaceEmbedderId('invalid')).toBe('fastembed');
    expect(new InMemoryForgeUsageSink().list()).toEqual([]);
    expect(typeof ForgeMcpToolset).toBe('function');
  });

  it('maps tools and workflows into runtime actions', async () => {
    const pingTool = createTool({
      id: 'ping',
      description: 'Ping tool.',
      inputSchema: z.object({
        text: z.string(),
      }),
      execute(input) {
        return {
          echoed: input.text,
        };
      },
    });
    const workflow = createWorkflow({
      id: 'demo-workflow',
      inputSchema: z.object({
        text: z.string(),
      }),
      outputSchema: z.object({
        echoed: z.string(),
      }),
    })
      .then(createStep({
        id: 'demo-step',
        inputSchema: z.object({
          text: z.string(),
        }),
        outputSchema: z.object({
          echoed: z.string(),
        }),
        execute({ inputData }) {
          return {
            echoed: inputData.text,
          };
        },
      }))
      .commit();

    const actions = toolsToRuntimeActions({
      ping: pingTool,
      ...workflowsToTools({
        demo: workflow,
      }),
    });

    expect(actions).toHaveLength(2);
    expect(actions.map((action) => action.name)).toEqual(['ping', 'demo-workflow']);
    await expect(Promise.resolve(actions[0]!.execute({
      text: 'hello',
    }, {
      runtimeId: 'runtime',
      stepId: 'step',
      stepNumber: 1,
    }))).resolves.toEqual({
      echoed: 'hello',
    });
  });
});
