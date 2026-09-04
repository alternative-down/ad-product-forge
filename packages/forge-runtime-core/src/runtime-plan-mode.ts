import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import type { RuntimeActionDefinition } from 'agent-runtime-core/integrations';

export type PlanStatus = 'draft' | 'active' | 'completed';

export type PlanEntry = {
  id: number;
  intent: string;
  plan: string;
  status: PlanStatus;
  completionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

const enterPlanModeSchema = z.object({
  intent: z.string().trim().min(1),
});

const exitPlanModeSchema = z.object({
  plan: z.string().trim().min(1),
});

const completePlanSchema = z.object({
  completionNote: z.string().trim().min(1),
});

const writeActionMarkers = [
  'write',
  'create',
  'update',
  'delete',
  'remove',
  'execute',
  'send',
  'post',
  'upload',
  'commit',
  'push',
  'merge',
  'deploy',
  'restart',
];

function isReadOnlyAction(
  action: RuntimeActionDefinition<Record<string, unknown>, unknown>,
): boolean {
  const description = `${action.name} ${action.description}`.toLowerCase();
  return !writeActionMarkers.some((marker) => description.includes(marker));
}

export class RuntimePlanMode {
  private readonly plansDirectory: string;
  private planning = false;
  private draft: PlanEntry | null = null;

  constructor(options: { agentMemoryPath: string }) {
    this.plansDirectory = join(options.agentMemoryPath, 'plans');
  }

  get isPlanning(): boolean {
    return this.planning;
  }

  async enter(intent: string): Promise<PlanEntry> {
    const plans = await this.readPlans();
    const now = new Date().toISOString();
    const draft: PlanEntry = {
      id: plans.reduce((largest, plan) => Math.max(largest, plan.id), 0) + 1,
      intent,
      plan: '',
      status: 'draft',
      completionNote: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.writePlan(draft);
    this.draft = draft;
    this.planning = true;
    return draft;
  }

  async activate(planText: string): Promise<PlanEntry> {
    if (this.draft === null) {
      throw new Error('Enter plan mode before activating a plan.');
    }

    const plans = await this.readPlans();
    const activePlan = plans.find((plan) => plan.status === 'active');

    if (activePlan !== undefined) {
      await this.writePlan({
        ...activePlan,
        status: 'completed',
        completionNote: `Superseded by plan ${this.draft.id}.`,
        updatedAt: new Date().toISOString(),
      });
    }

    const activated: PlanEntry = {
      ...this.draft,
      plan: planText,
      status: 'active',
      updatedAt: new Date().toISOString(),
    };
    await this.writePlan(activated);
    this.draft = null;
    this.planning = false;
    return activated;
  }

  async complete(completionNote: string): Promise<PlanEntry> {
    const activePlan = (await this.readPlans()).find((plan) => plan.status === 'active');

    if (activePlan === undefined) {
      throw new Error('There is no active plan to complete.');
    }

    const completed: PlanEntry = {
      ...activePlan,
      status: 'completed',
      completionNote,
      updatedAt: new Date().toISOString(),
    };
    await this.writePlan(completed);
    return completed;
  }

  async getContextText(): Promise<string> {
    const plans = await this.readPlans();
    const activePlan = plans.find((plan) => plan.status === 'active');
    const recentPlans = plans
      .filter((plan) => plan.status === 'completed')
      .sort((left, right) => right.id - left.id)
      .slice(0, 5);
    const blocks: string[] = [];

    if (activePlan !== undefined) {
      blocks.push(
        [
          `<active_plan id="${activePlan.id}" path="${this.relativePlanPath(activePlan.id)}">`,
          `  <intent>${escapeXml(activePlan.intent)}</intent>`,
          `  <plan>${escapeXml(activePlan.plan)}</plan>`,
          '</active_plan>',
        ].join('\n'),
      );
    }

    if (recentPlans.length > 0) {
      blocks.push(
        [
          '<recent_plans>',
          ...recentPlans.map(
            (plan) =>
              `  <plan id="${plan.id}" path="${this.relativePlanPath(plan.id)}">${escapeXml(plan.completionNote ?? plan.intent)}</plan>`,
          ),
          '</recent_plans>',
        ].join('\n'),
      );
    }

    return blocks.join('\n\n');
  }

  filterReadOnlyActions(
    actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>,
  ): Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> {
    return actions.filter((action) => {
      if (action.name === 'exitPlanMode') {
        return true;
      }
      if (action.name === 'enterPlanMode' || action.name === 'completePlan') {
        return false;
      }
      return isReadOnlyAction(action);
    });
  }

  private async readPlans(): Promise<PlanEntry[]> {
    await mkdir(this.plansDirectory, { recursive: true });
    const fileNames = (await readdir(this.plansDirectory)).filter((name) =>
      /^\d+-plan\.md$/.test(name),
    );
    const plans = await Promise.all(
      fileNames.map(async (fileName) =>
        this.parsePlan(await readFile(join(this.plansDirectory, fileName), 'utf8')),
      ),
    );
    return plans.sort((left, right) => left.id - right.id);
  }

  private async writePlan(plan: PlanEntry): Promise<void> {
    await mkdir(this.plansDirectory, { recursive: true });
    await writeFile(
      join(this.plansDirectory, `${plan.id}-plan.md`),
      [
        `id: ${plan.id}`,
        `status: ${plan.status}`,
        `createdAt: ${plan.createdAt}`,
        `updatedAt: ${plan.updatedAt}`,
        '',
        '## Intent',
        plan.intent,
        '',
        '## Plan',
        plan.plan,
        '',
        '## Completion note',
        plan.completionNote ?? '',
      ].join('\n'),
      'utf8',
    );
  }

  private parsePlan(content: string): PlanEntry {
    const metadata = Object.fromEntries(
      content
        .split('\n')
        .slice(0, 4)
        .map((line) => {
          const separator = line.indexOf(':');
          return [line.slice(0, separator), line.slice(separator + 1).trim()];
        }),
    );
    const intent = content.match(/## Intent\n([\s\S]*?)\n\n## Plan/)?.[1]?.trim() ?? '';
    const plan = content.match(/## Plan\n([\s\S]*?)\n\n## Completion note/)?.[1]?.trim() ?? '';
    const parsedCompletionNote = content.match(/## Completion note\n([\s\S]*)$/)?.[1]?.trim();
    const completionNote =
      parsedCompletionNote === undefined || parsedCompletionNote === ''
        ? null
        : parsedCompletionNote;

    return {
      id: Number(metadata.id),
      status: metadata.status as PlanStatus,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      intent,
      plan,
      completionNote,
    };
  }

  private relativePlanPath(id: number) {
    return `memory/plans/${id}-plan.md`;
  }
}

export function createPlanModeActions(planMode: RuntimePlanMode) {
  const enterPlanMode: RuntimeActionDefinition<Record<string, unknown>, unknown> = {
    name: 'enterPlanMode',
    description: 'Enter read-only planning mode to investigate and prepare a new persistent plan.',
    inputSchema: enterPlanModeSchema,
    async execute(input) {
      const { intent } = enterPlanModeSchema.parse(input);
      const plan = await planMode.enter(intent);
      return { id: plan.id, status: plan.status };
    },
  };
  const exitPlanMode: RuntimeActionDefinition<Record<string, unknown>, unknown> = {
    name: 'exitPlanMode',
    description:
      'Save the future execution plan, leave read-only planning mode, and begin execution.',
    inputSchema: exitPlanModeSchema,
    async execute(input) {
      const { plan } = exitPlanModeSchema.parse(input);
      const activePlan = await planMode.activate(plan);
      return {
        id: activePlan.id,
        status: activePlan.status,
        path: `memory/plans/${activePlan.id}-plan.md`,
      };
    },
  };
  const completePlan: RuntimeActionDefinition<Record<string, unknown>, unknown> = {
    name: 'completePlan',
    description:
      'Complete the active plan and add a retrospective note without rewriting its original future-oriented text.',
    inputSchema: completePlanSchema,
    async execute(input) {
      const { completionNote } = completePlanSchema.parse(input);
      const completed = await planMode.complete(completionNote);
      return {
        id: completed.id,
        status: completed.status,
        path: `memory/plans/${completed.id}-plan.md`,
      };
    },
  };

  return { enterPlanMode, exitPlanMode, completePlan };
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
