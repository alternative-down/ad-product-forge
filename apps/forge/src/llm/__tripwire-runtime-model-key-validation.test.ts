// Tripwire: enforce modelKey validation BEFORE the template-literal cast
// in apps/forge/src/llm/runtime-model.ts (#6027 P2, L#NN-32 v8).
//
// Without validation, modelKeys like 'gpt-4' or 'claude-sonnet' (no slash)
// silently pass the `as \`${string}/${string}\`` cast and produce a model id
// that violates the downstream AgentConfig['model']['id'] contract.
//
// The fix MUST validate that modelKey contains a non-leading, non-trailing '/'
// before the cast. This tripwire asserts the validation block is present and
// that the throw path is reachable for malformed modelKeys.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_MODEL_PATH = resolve(__dirname, 'runtime-model.ts');

describe('L#NN-32 v8 tripwire: llm/runtime-model.ts validates modelKey before cast (#6027)', () => {
  const source = readFileSync(RUNTIME_MODEL_PATH, 'utf8');

  it('the default-case cast is preceded by a slash validation block', () => {
    // Locate the cast: `id: profile.modelKey as \`${string}/${string}\``
    const castIdx = source.indexOf("id: profile.modelKey as `${string}/${string}`");
    expect(castIdx, 'template-literal cast must exist').toBeGreaterThanOrEqual(0);

    // The 800 chars before the cast must contain a slashIdx / indexOf('/') check
    const beforeCast = source.slice(Math.max(0, castIdx - 800), castIdx);
    expect(beforeCast).toMatch(/indexOf\(['"]\/['"]\)/);
    // Must throw on invalid input
    expect(beforeCast).toMatch(/throw new Error\(/);
  });

  it('the validation throws for modelKeys without a slash', () => {
    // Static analysis: ensure the validation logic rejects a slash-less key.
    // The pattern `slashIdx <= 0 || slashIdx === ... - 1` (or equivalent)
    // catches: empty, leading-slash, no-slash, trailing-slash keys.
    const castIdx = source.indexOf("id: profile.modelKey as `${string}/${string}`");
    const beforeCast = source.slice(Math.max(0, castIdx - 800), castIdx);
    // Must guard against both <=0 (no leading content) and ===length-1 (trailing slash)
    const hasGuard = /slashIdx\s*<=\s*0\s*\|\|\s*slashIdx\s*===\s*[a-zA-Z]+\.length\s*-\s*1/.test(beforeCast)
      || /slashIdx\s*<=\s*0\s*\|\|\s*slashIdx\s*===\s*profile\.modelKey\.length\s*-\s*1/.test(beforeCast)
      || /profile\.modelKey\.split\(['"]\/['"]\)\.length\s*!==\s*2/.test(beforeCast);
    expect(hasGuard, 'must validate split yields exactly 2 non-empty parts').toBe(true);
  });
});