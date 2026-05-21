import { describe, expect, it } from 'vitest';
import {
  renderCheckpointPackageReadme,
  renderReflectionFile,
  renderObservationFile,
} from './agent-ltm-checkpoint-render';

describe('agent-ltm-checkpoint-render', () => {
  describe('renderCheckpointPackageReadme', () => {
    it('returns trimmed checkpoint summary text with trailing newline', () => {
      const result = renderCheckpointPackageReadme({
        payload: {
          checkpointSummary: { text: '  Summary text here  ' },
        } as never,
      });
      expect(result).toBe('Summary text here\n');
    });

    it('handles multi-line summary text with trailing newline', () => {
      const result = renderCheckpointPackageReadme({
        payload: {
          checkpointSummary: { text: 'Line one\n\nLine two\n\n  Line three  ' },
        } as never,
      });
      expect(result).toBe('Line one\n\nLine two\n\n  Line three\n');
    });

    it('handles empty summary text', () => {
      const result = renderCheckpointPackageReadme({
        payload: {
          checkpointSummary: { text: '' },
        } as never,
      });
      // Empty input produces just the trailing newline from the array join
      expect(result).toBe('\n');
    });
  });

  describe('renderReflectionFile', () => {
    it('includes createdAt in frontmatter', () => {
      const result = renderReflectionFile({
        createdAt: '2024-01-15T10:30:00Z',
        text: 'Reflection content here',
      } as never);
      expect(result).toContain('createdAt: 2024-01-15T10:30:00Z');
    });

    it('includes reflection text trimmed', () => {
      const result = renderReflectionFile({
        createdAt: '2024-01-15T10:30:00Z',
        text: '  Reflection text  ',
      } as never);
      expect(result).toContain('Reflection text');
      expect(result).not.toContain('  Reflection');
    });

    it('includes frontmatter delimiters', () => {
      const result = renderReflectionFile({
        createdAt: '2024-01-15T10:30:00Z',
        text: 'content',
      } as never);
      expect(result).toMatch(/^---$/m);
    });
  });

  describe('renderObservationFile', () => {
    it('includes createdAt in frontmatter', () => {
      const result = renderObservationFile({
        createdAt: '2024-02-20T08:00:00Z',
        text: 'Observation content here',
      } as never);
      expect(result).toContain('createdAt: 2024-02-20T08:00:00Z');
    });

    it('includes observation text trimmed', () => {
      const result = renderObservationFile({
        createdAt: '2024-02-20T08:00:00Z',
        text: '  Observation text  ',
      } as never);
      expect(result).toContain('Observation text');
      expect(result).not.toContain('  Observation');
    });

    it('handles empty text', () => {
      const result = renderObservationFile({
        createdAt: '2024-02-20T08:00:00Z',
        text: '',
      } as never);
      expect(result).toContain('createdAt: 2024-02-20T08:00:00Z');
    });
  });
});
