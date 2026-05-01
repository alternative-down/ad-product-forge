import { describe, expect, it } from 'vitest';
import { isWorkingMemoryEqual } from './working-memory-equality.js';
import type { z } from 'zod';
import { WORKING_MEMORY_SCHEMA } from './working-memory.js';

type WorkingMemoryData = NonNullable<z.infer<typeof WORKING_MEMORY_SCHEMA>>;

const make = (data: Partial<WorkingMemoryData>): WorkingMemoryData =>
  data as WorkingMemoryData;

describe('isWorkingMemoryEqual', () => {
  it('returns true for identical objects', () => {
    const a = make({
      identity: {
        roleCore: 'MyRole',
        nonNegotiables: 'No overrides',
        operatingPrinciples: 'Act clearly',
      },
    });
    const b = make({
      identity: {
        roleCore: 'MyRole',
        nonNegotiables: 'No overrides',
        operatingPrinciples: 'Act clearly',
      },
    });
    expect(isWorkingMemoryEqual(a, b)).toBe(true);
  });

  it('returns true for objects with different key ordering', () => {
    // JSON.stringify produces different strings for these;
    // property-by-property comparison handles them correctly.
    const a = make({
      direction: { currentMission: 'Mission A', successDefinition: 'Win' },
    });
    const b = make({
      direction: { successDefinition: 'Win', currentMission: 'Mission A' },
    });
    expect(isWorkingMemoryEqual(a, b)).toBe(true);
  });

  it('returns false when a field value changes', () => {
    const a = make({
      domain: { scope: 'scope A', activities: 'act A', boundaries: 'bound A' },
    });
    const b = make({
      domain: { scope: 'scope B', activities: 'act A', boundaries: 'bound A' },
    });
    expect(isWorkingMemoryEqual(a, b)).toBe(false);
  });

  it('returns false when a field is added', () => {
    const a = make({ identity: { roleCore: 'RC' } });
    const b = make({ identity: { roleCore: 'RC', nonNegotiables: 'NN' } });
    expect(isWorkingMemoryEqual(a, b)).toBe(false);
  });

  it('returns false when a field is removed', () => {
    const a = make({ identity: { roleCore: 'RC', nonNegotiables: 'NN' } });
    const b = make({ identity: { roleCore: 'RC' } });
    expect(isWorkingMemoryEqual(a, b)).toBe(false);
  });

  it('returns true when both objects are empty top-level', () => {
    expect(isWorkingMemoryEqual(make({}), make({}))).toBe(true);
  });

  it('returns false for different top-level sections', () => {
    const a = make({
      identity: { roleCore: 'RC', nonNegotiables: 'NN', operatingPrinciples: 'OP' },
    });
    const b = make({
      domain: { scope: 'S', activities: 'A', boundaries: 'B' },
    });
    expect(isWorkingMemoryEqual(a, b)).toBe(false);
  });

  it('returns true for deeply nested identical objects', () => {
    const a = make({
      identity: {
        roleCore: 'RC',
        nonNegotiables: 'NN',
        operatingPrinciples: 'OP',
      },
      direction: { currentMission: 'CM', successDefinition: 'SD' },
    });
    const b = make({
      identity: {
        operatingPrinciples: 'OP',
        nonNegotiables: 'NN',
        roleCore: 'RC',
      },
      direction: { successDefinition: 'SD', currentMission: 'CM' },
    });
    expect(isWorkingMemoryEqual(a, b)).toBe(true);
  });

  it('returns false when partial sub-object differs from full', () => {
    // Only identity set vs identity + domain
    const a = make({
      identity: { roleCore: 'RC', nonNegotiables: 'NN', operatingPrinciples: 'OP' },
    });
    const b = make({ identity: { roleCore: 'RC' } });
    expect(isWorkingMemoryEqual(a, b)).toBe(false);
  });

  it('handles undefined vs missing field (core bug)', () => {
    // The bug: if a field goes from "present string" to `undefined`,
    // JSON.stringify produces the same serialized output and skips the write.
    // isWorkingMemoryEqual correctly detects the difference.
    const a = make({
      identity: { roleCore: 'RC', nonNegotiables: 'NN', operatingPrinciples: 'OP' },
    });
    const b = make({});
    expect(isWorkingMemoryEqual(a, b)).toBe(false);
  });

  it('returns false when string becomes empty string', () => {
    const a = make({
      direction: { currentMission: 'was here', successDefinition: 'SD' },
    });
    const b = make({
      direction: { currentMission: '', successDefinition: 'SD' },
    });
    expect(isWorkingMemoryEqual(a, b)).toBe(false);
  });

  it('returns true for nested objects with reordered keys at each level', () => {
    const a = make({
      identity: { operatingPrinciples: 'OP', roleCore: 'RC', nonNegotiables: 'NN' },
      domain: { activities: 'A', scope: 'S', boundaries: 'B' },
    });
    const b = make({
      identity: { roleCore: 'RC', nonNegotiables: 'NN', operatingPrinciples: 'OP' },
      domain: { scope: 'S', boundaries: 'B', activities: 'A' },
    });
    expect(isWorkingMemoryEqual(a, b)).toBe(true);
  });

  it('returns true for identical full objects', () => {
    const a = make({
      identity: { roleCore: 'RC', nonNegotiables: 'NN', operatingPrinciples: 'OP' },
      domain: { scope: 'S', activities: 'A', boundaries: 'B' },
      direction: { currentMission: 'CM', successDefinition: 'SD' },
    });
    const b = make({
      identity: { roleCore: 'RC', nonNegotiables: 'NN', operatingPrinciples: 'OP' },
      domain: { scope: 'S', activities: 'A', boundaries: 'B' },
      direction: { currentMission: 'CM', successDefinition: 'SD' },
    });
    expect(isWorkingMemoryEqual(a, b)).toBe(true);
  });
});