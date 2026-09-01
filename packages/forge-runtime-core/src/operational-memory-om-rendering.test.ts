import { describe, expect, it } from 'vitest';
import {
  buildOperationalMemoryOmModelMessages,
  buildOperationalMemoryOmSystemTexts,
} from './operational-memory-om-rendering.js';

describe('operational-memory-om-rendering', () => {
  describe('buildOperationalMemoryOmModelMessages', () => {
    it('returns empty array for empty state', () => {
      const result = buildOperationalMemoryOmModelMessages({
        checkpointSummary: null,
        activeReflectionBlocks: [],
        observationBlocks: [],
      });
      expect(result).toEqual([]);
    });

    it('returns system messages for checkpoint summary', () => {
      const result = buildOperationalMemoryOmModelMessages({
        checkpointSummary: { text: 'Summary text' },
        activeReflectionBlocks: [],
        observationBlocks: [],
      });
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('Summary text');
      expect(result[0].content).toContain('Checkpoint summary:');
    });

    it('returns system messages for reflection blocks', () => {
      const result = buildOperationalMemoryOmModelMessages({
        checkpointSummary: null,
        activeReflectionBlocks: [{ text: 'Reflection 1' }, { text: 'Reflection 2' }],
        observationBlocks: [],
      });
      expect(result).toHaveLength(2);
      result.forEach((msg) => {
        expect(msg.role).toBe('system');
        expect(msg.content).toContain('Active reflection:');
      });
    });

    it('returns system messages for observation blocks', () => {
      const result = buildOperationalMemoryOmModelMessages({
        checkpointSummary: null,
        activeReflectionBlocks: [],
        observationBlocks: [
          { reflectedGeneration: null, text: 'Observation 1' },
          { reflectedGeneration: 1, text: 'Should be filtered' },
        ],
      });
      // reflectedGeneration=1 means reflected → filtered out
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('Observation 1');
      expect(result[0].content).toContain('Active observation:');
    });

    it('filters out null and empty text blocks', () => {
      const result = buildOperationalMemoryOmModelMessages({
        checkpointSummary: { text: null },
        activeReflectionBlocks: [{ text: null }, { text: '  ' }],
        observationBlocks: [{ reflectedGeneration: null, text: '' }],
      });
      expect(result).toEqual([]);
    });

    it('handles checkpointSummary with null object', () => {
      const result = buildOperationalMemoryOmModelMessages({
        checkpointSummary: null,
        activeReflectionBlocks: [],
        observationBlocks: [],
      });
      expect(result).toEqual([]);
    });

    it('normalizes text with whitespace', () => {
      const result = buildOperationalMemoryOmModelMessages({
        checkpointSummary: { text: '  Whitespace test  ' },
        activeReflectionBlocks: [],
        observationBlocks: [],
      });
      expect(result[0].content).toContain('Whitespace test');
    });
  });

  describe('buildOperationalMemoryOmSystemTexts', () => {
    it('returns empty strings for empty state', () => {
      const result = buildOperationalMemoryOmSystemTexts({
        checkpointSummary: null,
        activeReflectionBlocks: [],
        observationBlocks: [],
      });
      expect(result).toHaveLength(3);
      expect(result).toEqual(['', '', '']);
    });

    it('returns checkpoint text in first slot', () => {
      const result = buildOperationalMemoryOmSystemTexts({
        checkpointSummary: { text: 'Checkpoint here' },
        activeReflectionBlocks: [],
        observationBlocks: [],
      });
      expect(result[0]).toContain('Checkpoint here');
      expect(result[1]).toBe('');
      expect(result[2]).toBe('');
    });

    it('returns reflection header and content in second slot', () => {
      const result = buildOperationalMemoryOmSystemTexts({
        checkpointSummary: null,
        activeReflectionBlocks: [{ text: 'Ref A' }, { text: 'Ref B' }],
        observationBlocks: [],
      });
      expect(result[1]).toContain('Active reflections:');
      expect(result[1]).toContain('Ref A');
      expect(result[1]).toContain('Ref B');
    });

    it('returns observation header and content in third slot', () => {
      const result = buildOperationalMemoryOmSystemTexts({
        checkpointSummary: null,
        activeReflectionBlocks: [],
        observationBlocks: [{ reflectedGeneration: null, text: 'Obs 1' }],
      });
      expect(result[2]).toContain('Active observations:');
      expect(result[2]).toContain('Obs 1');
    });

    it('filters reflected observations (reflectedGeneration !== null)', () => {
      const result = buildOperationalMemoryOmSystemTexts({
        checkpointSummary: null,
        activeReflectionBlocks: [],
        observationBlocks: [
          { reflectedGeneration: null, text: 'Active obs' },
          { reflectedGeneration: 2, text: 'Reflected obs' },
        ],
      });
      expect(result[2]).toContain('Active obs');
      expect(result[2]).not.toContain('Reflected obs');
    });

    it('summary replaces reflections when both present', () => {
      // When checkpointSummary exists, it supersedes activeReflectionBlocks.
      // Reflections should not appear alongside the summary.
      const result = buildOperationalMemoryOmSystemTexts({
        checkpointSummary: { text: 'Summary' },
        activeReflectionBlocks: [{ text: 'Reflection' }],
        observationBlocks: [{ reflectedGeneration: null, text: 'Observation' }],
      });
      expect(result[0]).toContain('Summary');
      expect(result[1]).not.toContain('Reflection'); // replaced by summary
      expect(result[2]).toContain('Observation');
    });

    it('reflections shown when no checkpointSummary', () => {
      const result = buildOperationalMemoryOmSystemTexts({
        checkpointSummary: null,
        activeReflectionBlocks: [{ text: 'Reflection' }],
        observationBlocks: [{ reflectedGeneration: null, text: 'Observation' }],
      });
      expect(result[0]).toBe(''); // no summary
      expect(result[1]).toContain('Reflection');
      expect(result[2]).toContain('Observation');
    });
  });
});
