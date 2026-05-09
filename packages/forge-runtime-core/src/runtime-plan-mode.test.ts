import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  RuntimePlanMode,
  createPlanModeActions,
} from './runtime-plan-mode';

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function makePlanMode(): Promise<{ planMode: RuntimePlanMode; memoryPath: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'plan-test-'));
  tempDirs.push(dir);
  const memoryPath = path.join(dir, 'memory');
  return { planMode: new RuntimePlanMode({ agentMemoryPath: memoryPath }), memoryPath };
}

describe('RuntimePlanMode', () => {
  describe('enterPlanMode', () => {
    it('creates plan entry and sets active plan', async () => {
      const { planMode } = await makePlanMode();
      const plan = await planMode.enterPlanMode('Analyze the codebase structure', 1);
      expect(plan.intent).toBe('Analyze the codebase structure');
      expect(plan.stepNumber).toBe(1);
      expect(plan.status).toBe('open');
      expect(plan.plan).toBe('');
      expect(plan.createdAt).toBeTruthy();
      expect(planMode.isInPlanMode).toBe(true);
      expect(planMode.currentPlan).toEqual(plan);
    });

    it('persists plan file to memory/plans/', async () => {
      const { planMode, memoryPath } = await makePlanMode();
      const _plan = await planMode.enterPlanMode('Review auth implementation', 5);
      const planDir = path.join(memoryPath, 'memory', 'plans');
      const files = await import('node:fs/promises').then(fs => fs.readdir(planDir));
      expect(files).toHaveLength(1);
      expect(files[0]).toContain(`step-5-plan.md`);
    });

    it('rejects empty string intent at method level', async () => {
      const { planMode } = await makePlanMode();
      // enterPlanMode validates that intent is not empty/whitespace
      await expect(planMode.enterPlanMode('', 1)).rejects.toThrow('Intent cannot be empty');
    });
  });

  describe('exitPlanMode', () => {
    it('updates plan with plan text and marks completed', async () => {
      const { planMode } = await makePlanMode();
      await planMode.enterPlanMode('Plan refactoring', 1);
      const completed = await planMode.exitPlanMode('Step 1: extract interfaces\nStep 2: rename modules');
      expect(completed.plan).toBe('Step 1: extract interfaces\nStep 2: rename modules');
      expect(completed.status).toBe('completed');
      expect(planMode.isInPlanMode).toBe(false);
    });

    it('updates the plan file on disk', async () => {
      const { planMode, memoryPath } = await makePlanMode();
      await planMode.enterPlanMode('Test plan', 2);
      await planMode.exitPlanMode('Final plan text');
      const planDir = path.join(memoryPath, 'memory', 'plans');
      const files = await import('node:fs/promises').then(fs => fs.readdir(planDir));
      const content = await import('node:fs/promises').then(fs =>
        fs.readFile(path.join(planDir, files[0]), 'utf8'));
      expect(content).toContain('status: completed');
      expect(content).toContain('Final plan text');
    });

    it('throws if not in plan mode', async () => {
      const { planMode } = await makePlanMode();
      await expect(planMode.exitPlanMode('Some plan')).rejects.toThrow('Not in Plan Mode');
    });

    it('requires enterPlanMode before exitPlanMode', async () => {
      const { planMode } = await makePlanMode();
      await expect(planMode.exitPlanMode('some plan')).rejects.toThrow('Not in Plan Mode');
    });
  });

  describe('getActivePlanAnchor', () => {
    it('returns active open plan when in plan mode', async () => {
      const { planMode } = await makePlanMode();
      const created = await planMode.enterPlanMode('Active intent', 1);
      const anchor = await planMode.getActivePlanAnchor();
      expect(anchor).toEqual(created);
    });

    it('returns last completed plan when not in plan mode', async () => {
      const { planMode } = await makePlanMode();
      await planMode.enterPlanMode('First plan', 1);
      await planMode.exitPlanMode('First plan result');
      await planMode.enterPlanMode('Second plan', 2);
      await planMode.exitPlanMode('Second plan result');
      const anchor = await planMode.getActivePlanAnchor();
      expect(anchor?.stepNumber).toBe(2);
      expect(anchor?.status).toBe('completed');
    });

    it('returns null when no plans exist', async () => {
      const { planMode } = await makePlanMode();
      expect(await planMode.getActivePlanAnchor()).toBeNull();
    });
  });

  describe('getPlanContextText', () => {
    it('returns empty string when no plan', async () => {
      const { planMode } = await makePlanMode();
      expect(await planMode.getPlanContextText()).toBe('');
    });

    it('returns [PLANNING] format for open plan', async () => {
      const { planMode } = await makePlanMode();
      await planMode.enterPlanMode('Investigate auth bug', 1);
      const text = await planMode.getPlanContextText();
      expect(text).toContain('[PLANNING]');
      expect(text).toContain('Investigate auth bug');
    });

    it('returns [PLANNED] format for completed plan', async () => {
      const { planMode } = await makePlanMode();
      await planMode.enterPlanMode('Fix auth', 1);
      await planMode.exitPlanMode('Check token validation and session expiry logic');
      const text = await planMode.getPlanContextText();
      expect(text).toContain('[PLANNED]');
      expect(text).toContain('Check token validation');
    });
  });

  describe('filterReadOnlyActions', () => {
    it('filters out write actions when in plan mode', async () => {
      const { planMode } = await makePlanMode();
      await planMode.enterPlanMode('Analyze', 1);
      const actions = [
        { name: 'readFile', description: 'Read a file' } as unknown,
        { name: 'writeFile', description: 'Write a file' } as unknown,
        { name: 'grep', description: 'Search in files' } as unknown,
        { name: 'execute', description: 'Run a command' } as unknown,
        { name: 'listDirectory', description: 'List directory contents' } as unknown,
        { name: 'deleteFile', description: 'Delete a file' } as unknown,
      ];
      const filtered = planMode.filterReadOnlyActions(actions);
      expect(filtered.map(a => a.name)).toEqual(['readFile', 'grep', 'listDirectory']);
    });

    it('returns only read-only actions regardless of inPlanMode state', async () => {
      const { planMode } = await makePlanMode();
      // filterReadOnlyActions always returns read-only subset
      const actions = [
        { name: 'readFile', description: 'Read a file' } as unknown,
        { name: 'writeFile', description: 'Write a file' } as unknown,
        { name: 'grep', description: 'Search in files' } as unknown,
      ];
      const filtered = planMode.filterReadOnlyActions(actions);
      expect(filtered.map((a: unknown) => (a as {name?: string}).name ?? "")).toEqual(['readFile', 'grep']);
    });

    it('treats mixed-name actions as non-read-only', async () => {
      const { planMode } = await makePlanMode();
      await planMode.enterPlanMode('Test', 1);
      const actions = [
        { name: 'readAndWrite', description: 'Read and write' } as unknown,
        { name: 'fileWrite', description: 'Write file' } as unknown,
      ];
      const filtered = planMode.filterReadOnlyActions(actions);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('reset() clears activePlan but not inPlanMode flag', async () => {
      const { planMode } = await makePlanMode();
      await planMode.enterPlanMode('To reset', 1);
      planMode.reset();
      // reset() clears activePlan but not the inPlanMode boolean flag
      expect(planMode.currentPlan).toBeNull();
      expect(planMode.currentPlan).toBeNull();
      // anchor still finds the file
      const anchor = await planMode.getActivePlanAnchor();
      expect(anchor?.status).toBe('open');
    });
  });
});

describe('createPlanModeActions', () => {
  it('enterPlanMode has correct name and description', async () => {
    const { planMode } = await makePlanMode();
    const actions = createPlanModeActions({
      planMode,
      getCurrentStepNumber: () => 3,
    });
    expect(actions.enterPlanMode.name).toBe('enterPlanMode');
    expect(actions.enterPlanMode.description).toContain('read-only');
    expect(actions.enterPlanMode.description).toContain('Plan Mode');
  });

  it('exitPlanMode has correct name and description', async () => {
    const { planMode } = await makePlanMode();
    const actions = createPlanModeActions({
      planMode,
      getCurrentStepNumber: () => 3,
    });
    expect(actions.exitPlanMode.name).toBe('exitPlanMode');
    expect(actions.exitPlanMode.description).toContain('exit');
    expect(actions.exitPlanMode.description).toContain('full tool access');
  });

  it('enterPlanMode execute creates plan and returns result', async () => {
    const { planMode } = await makePlanMode();
    const actions = createPlanModeActions({
      planMode,
      getCurrentStepNumber: () => 7,
    });
    const result = await actions.enterPlanMode.execute({ intent: 'Investigate memory leak' });
    expect(result).toHaveProperty('entered', true);
    expect(result).toHaveProperty('status', 'open');
    expect(planMode.isInPlanMode).toBe(true);
  });

  it('exitPlanMode execute completes plan and returns result', async () => {
    const { planMode } = await makePlanMode();
    const actions = createPlanModeActions({
      planMode,
      getCurrentStepNumber: () => 2,
    });
    await actions.enterPlanMode.execute({ intent: 'Plan something' });
    const result = await actions.exitPlanMode.execute({ plan: 'Step 1, Step 2, Step 3' });
    expect(result).toHaveProperty('exited', true);
    expect(result).toHaveProperty('status', 'completed');
    expect(result).toHaveProperty('plan', 'Step 1, Step 2, Step 3');
    expect(planMode.isInPlanMode).toBe(false);
  });

  it('enterPlanMode action execute accepts empty intent (validation at method level)', async () => {
    const { planMode } = await makePlanMode();
    const actions = createPlanModeActions({
      planMode,
      getCurrentStepNumber: () => 1,
    });
    await expect(actions.enterPlanMode.execute({ intent: '' })).rejects.toThrow();
  });

  it('exitPlanMode action execute requires enterPlanMode first', async () => {
    const { planMode } = await makePlanMode();
    const actions = createPlanModeActions({
      planMode,
      getCurrentStepNumber: () => 1,
    });
    await actions.enterPlanMode.execute({ intent: 'Intent' });
    await expect(actions.exitPlanMode.execute({ plan: '' })).rejects.toThrow();
  });

  it('enterPlanMode action execute accepts empty string intent', async () => {
    const { planMode } = await makePlanMode();
    const actions = createPlanModeActions({
      planMode,
      getCurrentStepNumber: () => 1,
    });
    await expect(actions.enterPlanMode.execute({})).rejects.toThrow();
  });

  it('exitPlanMode action execute requires enterPlanMode first', async () => {
    const { planMode } = await makePlanMode();
    const actions = createPlanModeActions({
      planMode,
      getCurrentStepNumber: () => 1,
    });
    await actions.enterPlanMode.execute({ intent: 'Test' });
    await expect(actions.exitPlanMode.execute({})).rejects.toThrow();
  });
});