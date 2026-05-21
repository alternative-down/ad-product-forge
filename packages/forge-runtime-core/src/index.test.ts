import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ForgeMcpToolset,
  InMemoryForgeUsageSink,
  createTool,
  forgeDebug,
  isForgeDebugEnabled,
  resolveWorkspaceEmbedderId,
  toForgeSafeIdentifier,
  toolsToRuntimeActions,
} from './index.js';

describe('@forge-runtime/core', () => {
  it('exports identifier and debug helpers', () => {
    expect(toForgeSafeIdentifier('Meraxis Runtime')).toBe('Meraxis_Runtime');
    expect(typeof forgeDebug).toBe('function');
    expect(typeof isForgeDebugEnabled()).toBe('boolean');
  });

  it('exports runtime-facing helpers', () => {
    expect(resolveWorkspaceEmbedderId('transformers-multilingual-e5-small')).toBe(
      'transformers-multilingual-e5-small',
    );
    expect(resolveWorkspaceEmbedderId('invalid')).toBe('fastembed');
    expect(new InMemoryForgeUsageSink().list()).toEqual([]);
    expect(typeof ForgeMcpToolset).toBe('function');
  });

  it('maps tools into runtime actions', async () => {
    const pingTool = createTool({
      id: 'ping',
      description: 'Ping tool.',
      inputSchema: z.object({
        text: z.string(),
      }),
      execute(input: { text: string }) {
        return {
          echoed: input.text,
        };
      },
    });

    const actions = toolsToRuntimeActions({
      ping: pingTool,
    });

    expect(actions).toHaveLength(1);
    expect(actions.map((action) => action.name)).toEqual(['ping']);
    await expect(
      Promise.resolve(
        actions[0]!.execute(
          {
            text: 'hello',
          },
          {
            runtimeId: 'runtime',
            stepId: 'step',
            stepNumber: 1,
          },
        ),
      ),
    ).resolves.toEqual({
      echoed: 'hello',
    });
  });

  it('normalizes non-zod tool schemas into runtime actions', () => {
    const passthroughTool = createTool({
      id: 'passthrough',
      description: 'Passthrough tool.',
      inputSchema: {
        parse(input: unknown) {
          if (typeof input !== 'object' || input === null || !('ok' in input)) {
            throw new Error('missing ok');
          }

          return input;
        },
      },
      execute(input: unknown) {
        return input;
      },
    });

    const actions = toolsToRuntimeActions({
      passthrough: passthroughTool,
    });
    const action = actions[0]!;

    expect(actions).toHaveLength(1);
    expect(() => action.inputSchema.parse({ ok: true })).not.toThrow();
    expect(() => action.parseInput?.({})).toThrow('missing ok');
    expect(() => z.toJSONSchema(action.inputSchema)).not.toThrow();
  });
});
