/**
 * Unit tests for agents/ltm/renderers.ts.
 *
 * Tests renderCheckpointPackageReadme(), renderReflectionFile(),
 * and renderObservationFile() — markdown rendering helpers for
 * LTM checkpoint packages.
 */
import { describe, expect, it } from 'vitest';
import {
  renderCheckpointPackageReadme,
  renderReflectionFile,
  renderObservationFile,
} from './renderers';
import type { CheckpointedOmCheckpointPackageInput } from './store';

// ─── Test factories ─────────────────────────────────────────────────────────

function makePayload(overrides: Partial<CheckpointedOmCheckpointPackageInput> = {}): CheckpointedOmCheckpointPackageInput {
  return {
    checkpointSummary: { text: 'Test Summary', updatedAt: 1_700_000_000_000 },
    reflections: [],
    observations: [],
    packageId: 'test-package-001',
    ...overrides,
  } as CheckpointedOmCheckpointPackageInput;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('renderCheckpointPackageReadme', () => {
  it('should render a readme with the checkpoint summary text', () => {
    const payload = makePayload({ checkpointSummary: { text: 'My Checkpoint Summary', updatedAt: 1_700_000_000_000 } });
    const readme = renderCheckpointPackageReadme({ payload });
    expect(readme).toContain('My Checkpoint Summary');
  });

  it('should trim the summary text', () => {
    const payload = makePayload({ checkpointSummary: { text: '  Summary with spaces  ', updatedAt: 0 } });
    const readme = renderCheckpointPackageReadme({ payload });
    expect(readme).toContain('Summary with spaces');
    expect(readme).not.toContain('  Summary');
  });

  it('should handle missing checkpointSummary.text as empty string', () => {
    const payload = makePayload({ checkpointSummary: { text: undefined as unknown as string, updatedAt: 0 } });
    const readme = renderCheckpointPackageReadme({ payload });
    expect(readme).toBe('\n');
  });

  it('should handle empty checkpointSummary', () => {
    const payload = makePayload({ checkpointSummary: undefined as unknown as CheckpointedOmCheckpointPackageInput['checkpointSummary'] });
    const readme = renderCheckpointPackageReadme({ payload });
    expect(readme).toBe('\n');
  });
});

describe('renderReflectionFile', () => {
  it('should render a reflection with createdAt and text', () => {
    const reflection = { createdAt: 1_700_000_000_000, text: 'My reflection text' };
    const output = renderReflectionFile(reflection as Parameters<typeof renderReflectionFile>[0]);
    expect(output).toContain('createdAt: 1700000000000');
    expect(output).toContain('My reflection text');
  });

  it('should handle missing createdAt as undefined', () => {
    const reflection = { text: 'No date reflection' };
    const output = renderReflectionFile(reflection as Parameters<typeof renderReflectionFile>[0]);
    expect(output).toContain('createdAt: undefined');
    expect(output).toContain('No date reflection');
  });

  it('should handle missing text as empty string', () => {
    const reflection = { createdAt: 1_700_000_000_000 };
    const output = renderReflectionFile(reflection as Parameters<typeof renderReflectionFile>[0]);
    expect(output).toContain('createdAt: 1700000000000');
    // no text section content
  });

  it('should trim the text content', () => {
    const reflection = { createdAt: 0, text: '  trimmed text  ' };
    const output = renderReflectionFile(reflection as Parameters<typeof renderReflectionFile>[0]);
    expect(output).toContain('trimmed text');
    expect(output).not.toContain('  trimmed');
  });

  it('should handle text as empty string', () => {
    const reflection = { createdAt: 0, text: '' };
    const output = renderReflectionFile(reflection as Parameters<typeof renderReflectionFile>[0]);
    expect(output).toContain('---');
  });

  it('should include frontmatter dashes', () => {
    const reflection = { createdAt: 1, text: 'content' };
    const output = renderReflectionFile(reflection as Parameters<typeof renderReflectionFile>[0]);
    const dashes = output.match(/^---$/gm);
    expect(dashes).toHaveLength(2);
  });
});

describe('renderObservationFile', () => {
  it('should render an observation with createdAt and text', () => {
    const observation = { createdAt: 1_700_000_000_000, text: 'My observation text' };
    const output = renderObservationFile(observation as Parameters<typeof renderObservationFile>[0]);
    expect(output).toContain('createdAt: 1700000000000');
    expect(output).toContain('My observation text');
  });

  it('should handle missing createdAt as undefined', () => {
    const observation = { text: 'No date observation' };
    const output = renderObservationFile(observation as Parameters<typeof renderObservationFile>[0]);
    expect(output).toContain('createdAt: undefined');
    expect(output).toContain('No date observation');
  });

  it('should handle missing text as empty string', () => {
    const observation = { createdAt: 1_700_000_000_000 };
    const output = renderObservationFile(observation as Parameters<typeof renderObservationFile>[0]);
    expect(output).toContain('createdAt: 1700000000000');
  });

  it('should trim the text content', () => {
    const observation = { createdAt: 0, text: '  trimmed observation  ' };
    const output = renderObservationFile(observation as Parameters<typeof renderObservationFile>[0]);
    expect(output).toContain('trimmed observation');
    expect(output).not.toContain('  trimmed');
  });

  it('should handle text as empty string', () => {
    const observation = { createdAt: 0, text: '' };
    const output = renderObservationFile(observation as Parameters<typeof renderObservationFile>[0]);
    expect(output).toContain('---');
  });

  it('should include frontmatter dashes', () => {
    const observation = { createdAt: 1, text: 'content' };
    const output = renderObservationFile(observation as Parameters<typeof renderObservationFile>[0]);
    const dashes = output.match(/^---$/gm);
    expect(dashes).toHaveLength(2);
  });

  it('should handle numeric createdAt', () => {
    const observation = { createdAt: 1700000000000, text: 'numeric date' };
    const output = renderObservationFile(observation as Parameters<typeof renderObservationFile>[0]);
    expect(output).toContain('createdAt: 1700000000000');
  });

  it('should render reflection and observation with the same structure', () => {
    const reflection = { createdAt: 1_700_000_000_000, text: 'same structure' };
    const observation = { createdAt: 1_700_000_000_000, text: 'same structure' };
    const rOut = renderReflectionFile(reflection as Parameters<typeof renderReflectionFile>[0]);
    const oOut = renderObservationFile(observation as Parameters<typeof renderObservationFile>[0]);
    expect(rOut).toContain('createdAt: 1700000000000');
    expect(oOut).toContain('createdAt: 1700000000000');
  });
});