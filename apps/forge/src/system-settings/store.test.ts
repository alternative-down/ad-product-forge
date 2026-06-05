import { describe, expect, test, vi, beforeEach } from 'vitest';

const mockRow = vi.hoisted(() => ({
  id: 'global',
  companyName: 'Test Corp',
  companyContext: 'Test context',
  stepDelayEnabled: 1,
  communicationDmFlushingEnabled: 1,
  communicationGroupFlushingEnabled: 1,
  memoryLastMessagesFullEnabled: 0,
  memoryLastMessagesCount: 20,
  tokenCountFilterEnabled: 1,
  tokenCountFilterLimit: 100000,
  checkpointedOmEnabled: 0,
  checkpointedOmTotalContextTokens: 50000,
  checkpointedOmRecentRawTokens: 10000,
  checkpointedOmRawObservationBatchTokens: 5000,
  checkpointedOmObservationReflectionBatchTokens: 5000,
  checkpointedOmObservationSupportTokens: 2000,
  checkpointedOmReflectionSupportTokens: 2000,
  ltmRecallSearchMode: 'hybrid',
  ltmRecallWorkspaceTopK: 3,
  ltmRecallGraphTopK: 3,
  ltmRecallGraphThreshold: 0.7,
  ltmRecallGraphRandomWalkSteps: 50,
  ltmRecallGraphIncludeSources: 1,
  ltmRecallScoreThreshold: 0.7,
  ltmRecallDocumentCount: 3,
  updatedAt: 1700000000000,
}));

// Track insert / onConflictDoUpdate calls for verification
const insertCalls: unknown[] = [];
const onConflictCalls: unknown[] = [];

const mockDb = vi.hoisted(() => ({
  query: {
    systemSettings: {
      findFirst: vi.fn(),
    },
  },
  insert: vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((vals: unknown) => {
      insertCalls.push(vals);
      return {
        onConflictDoUpdate: vi.fn().mockImplementation((arg: unknown) => {
          onConflictCalls.push(arg);
          return Promise.resolve(undefined);
        }),
      };
    }),
  })),
}));

vi.mock('../database/schema', () => ({
  systemSettings: {},
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { createSystemSettingsStore } from './store';
import { systemSettings } from '../database/schema';
import { forgeDebug } from '@forge-runtime/core';

describe('createSystemSettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertCalls.length = 0;
    onConflictCalls.length = 0;
  });

  // ── getSettings ──────────────────────────────────────────────────────────

  describe('getSettings', () => {
    test('returns settings from DB when row exists', async () => {
      mockDb.query.systemSettings.findFirst.mockResolvedValue(mockRow);
      const store = createSystemSettingsStore(mockDb as any);
      const settings = await store.getSettings();

      expect(settings.companyName).toBe('Test Corp');
      expect(settings.companyContext).toBe('Test context');
      expect(settings.stepDelayEnabled).toBe(true);
      expect(settings.communicationDmFlushingEnabled).toBe(true);
      expect(settings.communicationGroupFlushingEnabled).toBe(true);
      expect(settings.memoryLastMessagesFullEnabled).toBe(false);
      expect(settings.checkpointedOmEnabled).toBe(false);
      expect(settings.ltmRecallSearchMode).toBe('hybrid');
      expect(settings.ltmRecallGraphThreshold).toBe(0.7);
    });

    test('returns defaults when no row exists', async () => {
      mockDb.query.systemSettings.findFirst.mockResolvedValue(null);
      const store = createSystemSettingsStore(mockDb as any);
      const settings = await store.getSettings();

      expect(settings.companyName).toBe('');
      expect(settings.companyContext).toBe('');
      expect(settings.stepDelayEnabled).toBe(true);
      expect(settings.communicationDmFlushingEnabled).toBe(true);
      expect(settings.communicationGroupFlushingEnabled).toBe(true);
      expect(settings.memoryLastMessagesFullEnabled).toBe(false);
      expect(settings.memoryLastMessagesCount).toBe(20);
      expect(settings.checkpointedOmEnabled).toBe(false);
      expect(settings.checkpointedOmTotalContextTokens).toBe(50000);
      expect(settings.checkpointedOmRecentRawTokens).toBe(10000);
      expect(settings.checkpointedOmRawObservationBatchTokens).toBe(5000);
      expect(settings.checkpointedOmObservationReflectionBatchTokens).toBe(5000);
      expect(settings.ltmRecallSearchMode).toBe('hybrid');
      expect(settings.ltmRecallWorkspaceTopK).toBe(3);
      expect(settings.ltmRecallGraphThreshold).toBe(0.7);
      expect(settings.ltmRecallScoreThreshold).toBe(0.7);
      expect(settings.ltmRecallDocumentCount).toBe(3);
      expect(settings.updatedAt).toBeNull();
    });

    test('uses DB row values over defaults when present', async () => {
      mockDb.query.systemSettings.findFirst.mockResolvedValue({
        ...mockRow,
        companyName: 'Override Corp',
        stepDelayEnabled: 0,
        ltmRecallSearchMode: 'vector',
        ltmRecallScoreThreshold: 0.9,
      });
      const store = createSystemSettingsStore(mockDb as any);
      const settings = await store.getSettings();

      expect(settings.companyName).toBe('Override Corp');
      expect(settings.stepDelayEnabled).toBe(false);
      expect(settings.ltmRecallSearchMode).toBe('vector');
      expect(settings.ltmRecallScoreThreshold).toBe(0.9);
    });

    test('resolves non-hybrid ltmRecallSearchMode to actual value', async () => {
      mockDb.query.systemSettings.findFirst.mockResolvedValue({
        ...mockRow,
        ltmRecallSearchMode: 'vector',
      });
      const store = createSystemSettingsStore(mockDb as any);
      const settings = await store.getSettings();
      // resolveRecallSearchMode: non-hybrid value passes through
      expect(settings.ltmRecallSearchMode).toBe('vector');
    });

    test('calls findFirst on systemSettings query', async () => {
      mockDb.query.systemSettings.findFirst.mockResolvedValue(null);
      const store = createSystemSettingsStore(mockDb as any);
      await store.getSettings();
      expect(mockDb.query.systemSettings.findFirst).toHaveBeenCalled();
    });

    test('logs at level error and returns defaults on DB error (regression for #5521)', async () => {
      const dbError = new Error('connection refused');
      mockDb.query.systemSettings.findFirst.mockRejectedValue(dbError);
      const store = createSystemSettingsStore(mockDb as any);
      const settings = await store.getSettings();
      // Loud log so on-call can find it; was level 'info' which is invisible
      expect(forgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'system-settings',
          level: 'error',
          message: 'getSettings failed',
        }),
      );
      // Backward-compat: callers still get DEFAULTS on error (16+ call sites)
      expect(settings).toMatchObject({
        companyName: '',
        stepDelayEnabled: true,
        updatedAt: null,
      });
    });
  });

  // ── upsertSettings ───────────────────────────────────────────────────────

  describe('upsertSettings', () => {
    test('inserts settings and returns the input values', async () => {
      const store = createSystemSettingsStore(mockDb as any);
      const result = await store.upsertSettings({
        companyName: 'New Company',
        companyContext: 'New context',
        stepDelayEnabled: false,
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: false,
        memoryLastMessagesFullEnabled: true,
        memoryLastMessagesCount: 30,
        tokenCountFilterEnabled: true,
        tokenCountFilterLimit: 200000,
        checkpointedOmEnabled: true,
        checkpointedOmTotalContextTokens: 40000,
        checkpointedOmRecentRawTokens: 8000,
        checkpointedOmRawObservationBatchTokens: 4000,
        checkpointedOmObservationReflectionBatchTokens: 4000,
        checkpointedOmObservationSupportTokens: 1500,
        checkpointedOmReflectionSupportTokens: 1500,
        ltmRecallSearchMode: 'hybrid',
        ltmRecallWorkspaceTopK: 5,
        ltmRecallGraphTopK: 5,
        ltmRecallGraphThreshold: 0.8,
        ltmRecallGraphRandomWalkSteps: 40,
        ltmRecallGraphIncludeSources: false,
        ltmRecallScoreThreshold: 0.85,
        ltmRecallDocumentCount: 5,
      });

      expect(result.companyName).toBe('New Company');
      expect(result.companyContext).toBe('New context');
      expect(result.stepDelayEnabled).toBe(false);
      expect(result.communicationGroupFlushingEnabled).toBe(false);
      expect(result.memoryLastMessagesFullEnabled).toBe(true);
      expect(result.checkpointedOmEnabled).toBe(true);
      expect(result.checkpointedOmTotalContextTokens).toBe(40000);
      expect(result.ltmRecallSearchMode).toBe('hybrid');
      expect(result.ltmRecallWorkspaceTopK).toBe(5);
      expect(result.ltmRecallScoreThreshold).toBe(0.85);
      expect(result.ltmRecallGraphIncludeSources).toBe(false);
      expect(result.updatedAt).toBeDefined();
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    test('calls db.insert with systemSettings table', async () => {
      const store = createSystemSettingsStore(mockDb as any);
      await store.upsertSettings({
        companyName: 'Test',
        companyContext: '',
        stepDelayEnabled: true,
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: true,
        memoryLastMessagesFullEnabled: false,
        memoryLastMessagesCount: 20,
        tokenCountFilterEnabled: true,
        tokenCountFilterLimit: 100000,
        checkpointedOmEnabled: false,
        checkpointedOmTotalContextTokens: 50000,
        checkpointedOmRecentRawTokens: 10000,
        checkpointedOmRawObservationBatchTokens: 5000,
        checkpointedOmObservationReflectionBatchTokens: 5000,
        checkpointedOmObservationSupportTokens: 2000,
        checkpointedOmReflectionSupportTokens: 2000,
        ltmRecallSearchMode: 'hybrid',
        ltmRecallWorkspaceTopK: 3,
        ltmRecallGraphTopK: 3,
        ltmRecallGraphThreshold: 0.7,
        ltmRecallGraphRandomWalkSteps: 50,
        ltmRecallGraphIncludeSources: true,
        ltmRecallScoreThreshold: 0.7,
        ltmRecallDocumentCount: 3,
      });

      expect(mockDb.insert).toHaveBeenCalledWith(systemSettings);
    });

    test('uses onConflictDoUpdate for upsert semantics', async () => {
      const store = createSystemSettingsStore(mockDb as any);
      await store.upsertSettings({
        companyName: 'Test',
        companyContext: '',
        stepDelayEnabled: true,
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: true,
        memoryLastMessagesFullEnabled: false,
        memoryLastMessagesCount: 20,
        tokenCountFilterEnabled: true,
        tokenCountFilterLimit: 100000,
        checkpointedOmEnabled: false,
        checkpointedOmTotalContextTokens: 50000,
        checkpointedOmRecentRawTokens: 10000,
        checkpointedOmRawObservationBatchTokens: 5000,
        checkpointedOmObservationReflectionBatchTokens: 5000,
        checkpointedOmObservationSupportTokens: 2000,
        checkpointedOmReflectionSupportTokens: 2000,
        ltmRecallSearchMode: 'hybrid',
        ltmRecallWorkspaceTopK: 3,
        ltmRecallGraphTopK: 3,
        ltmRecallGraphThreshold: 0.7,
        ltmRecallGraphRandomWalkSteps: 50,
        ltmRecallGraphIncludeSources: true,
        ltmRecallScoreThreshold: 0.7,
        ltmRecallDocumentCount: 3,
      });

      expect(insertCalls.length).toBe(1);
      // onConflictDoUpdate must be called with the row, excluding `id`
      expect(onConflictCalls.length).toBe(1);
      const setArg = onConflictCalls[0] as { set: Record<string, unknown>; target: unknown };
      expect(setArg.target).toBe(systemSettings.id);
      expect(setArg.set).not.toHaveProperty('id');
      expect(setArg.set).toMatchObject({
        companyName: 'Test',
        stepDelayEnabled: 1,
        communicationDmFlushingEnabled: 1,
      });
    });

    test('converts boolean true to integer 1 in insert values', async () => {
      const store = createSystemSettingsStore(mockDb as any);
      await store.upsertSettings({
        companyName: 'Test',
        companyContext: '',
        stepDelayEnabled: true,
        communicationDmFlushingEnabled: false,
        communicationGroupFlushingEnabled: true,
        memoryLastMessagesFullEnabled: false,
        memoryLastMessagesCount: 20,
        tokenCountFilterEnabled: true,
        tokenCountFilterLimit: 100000,
        checkpointedOmEnabled: false,
        checkpointedOmTotalContextTokens: 50000,
        checkpointedOmRecentRawTokens: 10000,
        checkpointedOmRawObservationBatchTokens: 5000,
        checkpointedOmObservationReflectionBatchTokens: 5000,
        checkpointedOmObservationSupportTokens: 2000,
        checkpointedOmReflectionSupportTokens: 2000,
        ltmRecallSearchMode: 'hybrid',
        ltmRecallWorkspaceTopK: 3,
        ltmRecallGraphTopK: 3,
        ltmRecallGraphThreshold: 0.7,
        ltmRecallGraphRandomWalkSteps: 50,
        ltmRecallGraphIncludeSources: false,
        ltmRecallScoreThreshold: 0.7,
        ltmRecallDocumentCount: 3,
      });

      expect(insertCalls.length).toBe(1);
      const vals = insertCalls[0] as any;
      // Booleans that are true should be stored as 1; false as 0
      expect(vals.stepDelayEnabled).toBe(1);
      expect(vals.communicationDmFlushingEnabled).toBe(0);
      expect(vals.communicationGroupFlushingEnabled).toBe(1);
      expect(vals.memoryLastMessagesFullEnabled).toBe(0);
      expect(vals.tokenCountFilterEnabled).toBe(1);
      expect(vals.checkpointedOmEnabled).toBe(0);
      expect(vals.ltmRecallGraphIncludeSources).toBe(0);
    });
  });
});
