import { describe, expect, it, vi } from 'vitest';
import type { OpsConfig } from './context';

/**
 * Compile-time + runtime regression test for #5471.
 *
 * Before the fix, `OpsConfig.httpServer` was typed as `any`, which:
 * - Defeats TS autocomplete for `registerRoute`
 * - Allows passing any object (no compile-time check)
 * - Allows calling methods that don't exist on the real server
 *
 * After the fix, `httpServer` is `ForgeHttpServerAdapter`
 * (= `Pick<ForgeHttpServer, 'registerRoute'>`).
 *
 * This test verifies the type is `ForgeHttpServerAdapter` and not `any` by
 * using `@ts-expect-error` on calls that should be rejected by the typed
 * adapter but accepted by `any`.
 */
describe('OpsConfig.httpServer (regression for #5471)', () => {
  it('accepts a ForgeHttpServerAdapter-shaped object (registerRoute only)', () => {
    const config: OpsConfig = {
      db: vi.fn() as unknown as OpsConfig['db'],
      httpServer: {
        registerRoute: vi.fn(() => () => {}),
      },
      integrations: vi.fn() as unknown as OpsConfig['integrations'],
    };

    // Smoke: the typed httpServer can call registerRoute without an `as any` cast.
    const cleanup = config.httpServer.registerRoute({
      method: 'POST',
      path: '/test',
      handler: vi.fn(),
    });
    expect(typeof cleanup).toBe('function');
  });

  it('rejects non-adapter methods (compile-time check via @ts-expect-error)', () => {
    // If `httpServer` is widened back to `any`, this line compiles fine and
    // `@ts-expect-error` becomes a TS error (because no error was expected).
    // If `httpServer` is `ForgeHttpServerAdapter`, `start()` is not in the
    // type, so the call fails and `@ts-expect-error` is satisfied.
    type AdapterType = OpsConfig['httpServer'];
    const sample: AdapterType = {
      registerRoute: vi.fn(() => () => {}),
    } as AdapterType;
    // @ts-expect-error — start() is not in ForgeHttpServerAdapter
    void sample.start;

    expect(sample).toBeDefined();
  });
});
