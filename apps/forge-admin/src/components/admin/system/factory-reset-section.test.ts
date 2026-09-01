// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level tripwire for D49 #6521 PR-B (frontend UI).
 *
 * Verifies the non-admin re-framing of FactoryResetSection:
 *   1. Badge with "Disponível para todos os roles" copy is present in the source.
 *   2. Badge is imported from `@/components/ui/badge`.
 *   3. The old admin-only visual destaque (`border-destructive/30`, `bg-destructive/5`)
 *      is removed from the section root.
 *
 * Source-level (not render-level) because the vitest config for forge-admin
 * restricts to `.test.ts` (no `.test.tsx`). Mirrors the L#NN-17 C3 tripwire
 * pattern used by jsx-component-imports.test.ts (#5720).
 */
describe('factory-reset-section (D49 #6521 PR-B)', () => {
  const SECTION_PATH = resolve(__dirname, 'factory-reset-section.tsx');
  const SOURCE = readFileSync(SECTION_PATH, 'utf-8');

  it('declares the "Disponível para todos os roles" badge copy', () => {
    expect(SOURCE).toContain('Disponível para todos os roles');
  });

  it('imports Badge from @/components/ui/badge', () => {
    expect(SOURCE).toMatch(/import\s*\{[^}]*\bBadge\b[^}]*\}\s*from\s*['"]@\/components\/ui\/badge['"]/);
  });

  it('uses the Badge component inside the JSX', () => {
    // Light-weight guard: the JSX contains a <Badge ...> usage.
    expect(SOURCE).toMatch(/<Badge[\s>]/);
  });

  it('removes the admin-only visual destaque from the section root', () => {
    // The old destructive-bg visual cue was tied to the admin-only route. Spec
    // #6521 PR-B calls for a neutral destructive-action tone.
    expect(SOURCE).not.toMatch(/border-destructive\/30/);
    expect(SOURCE).not.toMatch(/bg-destructive\/5/);
  });

  it('doc comment mentions spec #6521 and the non-admin scope', () => {
    expect(SOURCE).toMatch(/#6521/);
    expect(SOURCE).toMatch(/all authenticated roles/i);
  });
});
