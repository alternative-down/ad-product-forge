import { describe, expect, it } from 'vitest';
import { WORKING_MEMORY_INSTRUCTIONS, WORKING_MEMORY_SCHEMA } from './working-memory.js';

describe('working-memory', () => {
  describe('WORKING_MEMORY_INSTRUCTIONS', () => {
    it('is a non-empty string', () => {
      expect(typeof WORKING_MEMORY_INSTRUCTIONS).toBe('string');
      expect(WORKING_MEMORY_INSTRUCTIONS.length).toBeGreaterThan(0);
    });

    it('mentions working memory as core concept', () => {
      expect(WORKING_MEMORY_INSTRUCTIONS).toContain('Working memory');
    });

    it('mentions domain section', () => {
      expect(WORKING_MEMORY_INSTRUCTIONS).toContain('domain');
    });

    it('mentions direction section', () => {
      expect(WORKING_MEMORY_INSTRUCTIONS).toContain('direction');
    });

    it('includes guidance about keeping fields clear', () => {
      expect(WORKING_MEMORY_INSTRUCTIONS).toContain('clear');
    });
  });

  describe('WORKING_MEMORY_SCHEMA', () => {
    it('validates a fully populated identity', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({
        identity: {
          roleCore: 'Senior engineer',
          nonNegotiables: 'No breaking tests',
          operatingPrinciples: 'Prefer simple solutions',
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates with only identity fields', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({
        identity: {
          roleCore: 'Backend developer',
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates with all sections', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({
        identity: {
          roleCore: 'Frontend engineer',
          nonNegotiables: 'No console.log',
          operatingPrinciples: 'Test first',
        },
        domain: {
          scope: 'UI development',
          activities: 'Building components',
          boundaries: 'No backend work',
        },
        direction: {
          currentMission: 'Improve test coverage',
          successDefinition: '80% coverage',
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates with domain only', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({
        domain: {
          scope: 'Fullstack',
          activities: 'APIs and UIs',
          boundaries: 'DevOps excluded',
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates with direction only', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({
        direction: {
          currentMission: 'Launch feature X',
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates empty object (all fields optional)', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects non-string identity values', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({
        identity: {
          roleCore: 123,
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-string domain values', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({
        domain: {
          scope: ['array', 'not', 'string'],
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-string direction values', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({
        direction: {
          currentMission: true,
        },
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional nested fields missing', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({
        identity: {},
        domain: {},
        direction: {},
      });
      expect(result.success).toBe(true);
    });

    it('schema has expected top-level keys', () => {
      const result = WORKING_MEMORY_SCHEMA.safeParse({
        identity: { roleCore: 'x' },
        domain: { scope: 'x' },
        direction: { currentMission: 'x' },
      });
      expect(result.success).toBe(true);
    });
  });
});
