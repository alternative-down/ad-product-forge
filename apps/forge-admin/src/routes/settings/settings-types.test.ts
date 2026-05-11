import { describe, it, expect } from 'vitest';
import { toRuntimeDraft, fromRuntimeDraft } from './settings-types';

type PartialSystemSettings = Parameters<typeof toRuntimeDraft>[0];

const FULL_SETTINGS: PartialSystemSettings = {
  memoryLastMessagesFullEnabled: true,
  memoryLastMessagesCount: 20,
  tokenCountFilterEnabled: false,
  tokenCountFilterLimit: 4096,
  checkpointedOmEnabled: true,
  checkpointedOmTotalContextTokens: 128000,
  checkpointedOmRecentRawTokens: 64000,
  checkpointedOmRawObservationBatchTokens: 8000,
  checkpointedOmObservationReflectionBatchTokens: 6000,
  checkpointedOmObservationSupportTokens: 4000,
  checkpointedOmReflectionSupportTokens: 2000,
  ltmRecallScoreThreshold: 0.7,
  ltmRecallDocumentCount: 10,
};

describe('settings-types helpers', () => {
  describe('toRuntimeDraft', () => {
    it('converts all numeric fields to strings', () => {
      const draft = toRuntimeDraft(FULL_SETTINGS);
      expect(draft.memoryLastMessagesCount).toBe('20');
      expect(draft.tokenCountFilterLimit).toBe('4096');
      expect(draft.checkpointedOmTotalContextTokens).toBe('128000');
      expect(draft.ltmRecallScoreThreshold).toBe('0.7');
      expect(draft.ltmRecallDocumentCount).toBe('10');
    });

    it('passes boolean fields unchanged', () => {
      const draft = toRuntimeDraft(FULL_SETTINGS);
      expect(draft.memoryLastMessagesFullEnabled).toBe(true);
      expect(draft.tokenCountFilterEnabled).toBe(false);
      expect(draft.checkpointedOmEnabled).toBe(true);
    });

    it('guards undefined numeric fields to "0" (not "undefined")', () => {
      const settings = {
        ...FULL_SETTINGS,
        memoryLastMessagesCount: undefined,
        tokenCountFilterLimit: undefined,
        ltmRecallScoreThreshold: undefined,
      } as unknown as PartialSystemSettings;
      const draft = toRuntimeDraft(settings);
      expect(draft.memoryLastMessagesCount).toBe('0');
      expect(draft.tokenCountFilterLimit).toBe('0');
      expect(draft.ltmRecallScoreThreshold).toBe('0');
    });

    it('guards null numeric fields to "0" (not "null")', () => {
      const settings = {
        ...FULL_SETTINGS,
        memoryLastMessagesCount: null,
        ltmRecallDocumentCount: null,
      } as unknown as PartialSystemSettings;
      const draft = toRuntimeDraft(settings);
      expect(draft.memoryLastMessagesCount).toBe('0');
      expect(draft.ltmRecallDocumentCount).toBe('0');
    });

    it('guards boolean fields against undefined (keeps original value)', () => {
      const settings = {
        memoryLastMessagesFullEnabled: undefined,
        tokenCountFilterEnabled: undefined,
        checkpointedOmEnabled: undefined,
      } as unknown as PartialSystemSettings;
      // booleans are not guarded by str(), so verify they stay as-is
      const draft = toRuntimeDraft(settings);
      expect(draft.memoryLastMessagesFullEnabled).toBeUndefined();
      expect(draft.tokenCountFilterEnabled).toBeUndefined();
    });

    it('guards zero values correctly', () => {
      const settings = {
        ...FULL_SETTINGS,
        memoryLastMessagesCount: 0,
        ltmRecallScoreThreshold: 0,
      };
      const draft = toRuntimeDraft(settings);
      expect(draft.memoryLastMessagesCount).toBe('0');
      expect(draft.ltmRecallScoreThreshold).toBe('0');
    });
  });

  describe('fromRuntimeDraft', () => {
    it('converts all numeric fields back from strings', () => {
      const draft = {
        memoryLastMessagesFullEnabled: true,
        memoryLastMessagesCount: '20',
        tokenCountFilterEnabled: false,
        tokenCountFilterLimit: '4096',
        checkpointedOmEnabled: true,
        checkpointedOmTotalContextTokens: '128000',
        checkpointedOmRecentRawTokens: '64000',
        checkpointedOmRawObservationBatchTokens: '8000',
        checkpointedOmObservationReflectionBatchTokens: '6000',
        checkpointedOmObservationSupportTokens: '4000',
        checkpointedOmReflectionSupportTokens: '2000',
        ltmRecallScoreThreshold: '0.7',
        ltmRecallDocumentCount: '10',
      };
      const base = { ...FULL_SETTINGS };
      const result = fromRuntimeDraft(draft, base);
      expect(result.memoryLastMessagesCount).toBe(20);
      expect(result.tokenCountFilterLimit).toBe(4096);
      expect(result.ltmRecallScoreThreshold).toBe(0.7);
      expect(result.ltmRecallDocumentCount).toBe(10);
    });

    it('preserves non-overwritten base fields', () => {
      const base = { ...FULL_SETTINGS, someOtherField: 'preserve' } as unknown as Parameters<typeof fromRuntimeDraft>[1];
      const draft = {
        memoryLastMessagesFullEnabled: true,
        memoryLastMessagesCount: '5',
      };
      const result = fromRuntimeDraft(draft, base);
      expect((result as Record<string, unknown>).someOtherField).toBe('preserve');
    });

    it('converts "undefined" string to NaN via Number() — edge case', () => {
      const draft = {
        memoryLastMessagesFullEnabled: true,
        memoryLastMessagesCount: 'undefined',
        tokenCountFilterEnabled: false,
        tokenCountFilterLimit: 'undefined',
      };
      const base = { ...FULL_SETTINGS };
      const result = fromRuntimeDraft(draft, base);
      // Number('undefined') === NaN — this is the existing behavior to document
      expect(Number(result.memoryLastMessagesCount)).toBeNaN();
    });

    it('converts zero strings correctly', () => {
      const draft = {
        memoryLastMessagesFullEnabled: true,
        memoryLastMessagesCount: '0',
        tokenCountFilterEnabled: false,
        tokenCountFilterLimit: '0',
        checkpointedOmEnabled: true,
        checkpointedOmTotalContextTokens: '0',
        checkpointedOmRecentRawTokens: '0',
        checkpointedOmRawObservationBatchTokens: '0',
        checkpointedOmObservationReflectionBatchTokens: '0',
        checkpointedOmObservationSupportTokens: '0',
        checkpointedOmReflectionSupportTokens: '0',
        ltmRecallScoreThreshold: '0',
        ltmRecallDocumentCount: '0',
      };
      const base = { ...FULL_SETTINGS };
      const result = fromRuntimeDraft(draft, base);
      expect(result.memoryLastMessagesCount).toBe(0);
      expect(result.ltmRecallScoreThreshold).toBe(0);
    });
  });
});
