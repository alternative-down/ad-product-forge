import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { RuntimePlanMode, createPlanModeActions } from './runtime-plan-mode';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function createPlanMode() {
  const agentMemoryPath = await mkdtemp(path.join(os.tmpdir(), 'forge-plans-'));
  tempDirs.push(agentMemoryPath);
  return { agentMemoryPath, planMode: new RuntimePlanMode({ agentMemoryPath }) };
}

describe('RuntimePlanMode', () => {
  it('persists an active future-oriented plan across runtime instances', async () => {
    const { agentMemoryPath, planMode } = await createPlanMode();
    const draft = await planMode.enter('Prepare the release');
    const active = await planMode.activate('1. Validate the build\n2. Publish the release');

    expect(draft.id).toBe(1);
    expect(active.status).toBe('active');
    expect(planMode.isPlanning).toBe(false);

    const restarted = new RuntimePlanMode({ agentMemoryPath });
    const context = await restarted.getContextText();
    expect(context).toContain('<active_plan id="1" path="memory/plans/1-plan.md">');
    expect(context).toContain('1. Validate the build');
  });

  it('records completion separately without rewriting the plan', async () => {
    const { agentMemoryPath, planMode } = await createPlanMode();
    await planMode.enter('Fix startup');
    await planMode.activate('1. Reproduce\n2. Correct the migration');
    await planMode.complete('Migration verified against a fresh database.');

    const content = await readFile(path.join(agentMemoryPath, 'plans', '1-plan.md'), 'utf8');
    expect(content).toContain('1. Reproduce\n2. Correct the migration');
    expect(content).toContain('## Completion note\nMigration verified against a fresh database.');
    expect(await planMode.getContextText()).toContain(
      'Migration verified against a fresh database.',
    );
  });

  it('keeps only the five most recent completed plan references in context', async () => {
    const { planMode } = await createPlanMode();

    for (let id = 1; id <= 6; id += 1) {
      await planMode.enter(`Intent ${id}`);
      await planMode.activate(`Plan ${id}`);
      await planMode.complete(`Completed ${id}`);
    }

    const context = await planMode.getContextText();
    expect(context).not.toContain('memory/plans/1-plan.md');
    expect(context).toContain('memory/plans/2-plan.md');
    expect(context).toContain('memory/plans/6-plan.md');
  });

  it('supersedes the previous active plan only when a new plan is activated', async () => {
    const { planMode } = await createPlanMode();
    await planMode.enter('First intent');
    await planMode.activate('First plan');
    await planMode.enter('Second intent');
    await planMode.activate('Second plan');

    const context = await planMode.getContextText();
    expect(context).toContain('<active_plan id="2"');
    expect(context).toContain('Superseded by plan 2.');
  });

  it('allows inspection and exiting while planning but filters mutation actions', async () => {
    const { planMode } = await createPlanMode();
    await planMode.enter('Investigate safely');

    const actions = [
      { name: 'readFile', description: 'Read a file' },
      { name: 'searchFiles', description: 'Search files' },
      { name: 'writeFile', description: 'Write a file' },
      { name: 'enterPlanMode', description: 'Enter planning' },
      { name: 'completePlan', description: 'Complete active plan' },
      { name: 'exitPlanMode', description: 'Save plan and exit' },
    ];

    expect(planMode.filterReadOnlyActions(actions).map((action) => action.name)).toEqual([
      'readFile',
      'searchFiles',
      'exitPlanMode',
    ]);
  });
});

describe('createPlanModeActions', () => {
  it('enters planning, activates a plan, and completes it', async () => {
    const { planMode } = await createPlanMode();
    const actions = createPlanModeActions(planMode);

    expect(await actions.enterPlanMode.execute({ intent: 'Prepare work' })).toEqual({
      id: 1,
      status: 'draft',
    });
    expect(await actions.exitPlanMode.execute({ plan: '1. Inspect\n2. Implement' })).toMatchObject({
      id: 1,
      status: 'active',
      path: 'memory/plans/1-plan.md',
    });
    expect(
      await actions.completePlan.execute({ completionNote: 'Delivered and verified.' }),
    ).toMatchObject({ id: 1, status: 'completed' });
  });

  it('validates action input at the boundary', async () => {
    const actions = createPlanModeActions((await createPlanMode()).planMode);

    await expect(actions.enterPlanMode.execute({ intent: '' })).rejects.toThrow();
    await expect(actions.exitPlanMode.execute({ plan: '' })).rejects.toThrow();
    await expect(actions.completePlan.execute({ completionNote: '' })).rejects.toThrow();
  });
});
