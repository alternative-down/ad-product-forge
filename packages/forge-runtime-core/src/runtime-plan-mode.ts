import { z } from 'zod';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { RuntimeActionDefinition } from 'agent-runtime-core/integrations';

export type PlanModeStatus = 'open' | 'completed';

export type PlanEntry = {
  createdAt: string;
  stepNumber: number;
  intent: string;
  plan: string;
  status: PlanModeStatus;
};

const enterPlanModeSchema = z.object({
  intent: z.string().min(1).refine(s => s.trim().length >= 1, {
    message: 'Intent cannot be empty or whitespace only',
  }),
});

const exitPlanModeSchema = z.object({
  plan: z.string().min(1).refine(s => s.trim().length >= 1, {
    message: 'Plan cannot be empty or whitespace only',
  }),
});

const PLANS_SUBDIR = 'plans';

function isReadOnlyAction(action: RuntimeActionDefinition<Record<string, unknown>, unknown>): boolean {
  const name = action.name.toLowerCase();
  const desc = action.description.toLowerCase();

  // Actions that are always write/mutation
  const writeMarkers = [
    'write', 'delete', 'remove', 'kill', 'stop', 'terminate',
    'create', 'add', 'send', 'post', 'put', 'update',
    'run', 'execute', 'bash', 'shell', 'command',
    'patch', 'merge', 'push', 'deploy',
  ];

  const hasWriteMarker = writeMarkers.some((m) =>
    name.includes(m) || desc.includes(m),
  );

  // Actions that are read-only
  const readMarkers = [
    'read', 'list', 'get', 'search', 'grep', 'find',
    'query', 'fetch', 'load', 'check', 'inspect',
    'stat', 'diff', 'log', 'show', 'view',
  ];

  const hasReadMarker = readMarkers.some((m) =>
    name.includes(m) || desc.includes(m),
  );

  // If has write marker and no read marker, it's a write action
  if (hasWriteMarker && !hasReadMarker) return false;

  // If has read marker and no write marker, it's read-only
  if (hasReadMarker && !hasWriteMarker) return true;

  // Default: treat as non-read-only (fallback to full mode)
  return false;
}

export class RuntimePlanMode {
  private activePlan: PlanEntry | null = null;
  private inPlanMode = false;
  private readonly plansDir: string;

  constructor(options: {
    agentMemoryPath: string;
  }) {
    this.plansDir = join(options.agentMemoryPath, 'memory', PLANS_SUBDIR);
  }

  get isInPlanMode(): boolean {
    return this.inPlanMode;
  }

  get currentPlan(): PlanEntry | null {
    return this.activePlan;
  }

  private async ensurePlansDir(): Promise<void> {
    await mkdir(this.plansDir, { recursive: true });
  }

  private planFilePath(plan: PlanEntry): string {
    const fileName = `${plan.createdAt}-step-${plan.stepNumber}-plan.md`;
    return resolve(this.plansDir, fileName);
  }

  private formatPlanFile(plan: PlanEntry): string {
    return [
      `createdAt: ${plan.createdAt}`,
      `stepNumber: ${plan.stepNumber}`,
      '',
      '## Intent',
      plan.intent,
      '',
      '## Plan',
      plan.plan,
      '',
      `status: ${plan.status}`,
    ].join('\n');
  }

  private parsePlanFile(content: string, filePath: string): PlanEntry {
    const lines = content.split('\n');
    let createdAt = '';
    let stepNumber = 0;
    let intent = '';
    let plan = '';
    let status: PlanModeStatus = 'open';

    let section = '';
    for (const line of lines) {
      if (line.startsWith('createdAt:')) {
        createdAt = line.replace('createdAt:', '').trim();
      } else if (line.startsWith('stepNumber:')) {
        stepNumber = parseInt(line.replace('stepNumber:', '').trim(), 10);
      } else if (line.startsWith('## Intent')) {
        section = 'intent';
      } else if (line.startsWith('## Plan')) {
        section = 'plan';
      } else if (line.startsWith('status:')) {
        status = (line.replace('status:', '').trim() as PlanModeStatus) ?? 'open';
      } else if (section === 'intent') {
        intent += (intent ? '\n' : '') + line;
      } else if (section === 'plan') {
        plan += (plan ? '\n' : '') + line;
      }
    }

    return { createdAt, stepNumber, intent, plan, status };
  }

  async enterPlanMode(intent: string, stepNumber: number): Promise<PlanEntry> {
    if (!intent || intent.trim().length === 0) {
      throw new Error('Intent cannot be empty or whitespace only');
    }
    await this.ensurePlansDir();

    const plan: PlanEntry = {
      createdAt: new Date().toISOString(),
      stepNumber,
      intent,
      plan: '',
      status: 'open',
    };

    await writeFile(this.planFilePath(plan), this.formatPlanFile(plan), 'utf8');
    this.activePlan = plan;
    this.inPlanMode = true;
    return plan;
  }

  async exitPlanMode(planText: string): Promise<PlanEntry> {
    if (!planText || planText.trim().length === 0) {
      throw new Error('Plan text cannot be empty or whitespace only');
    }
    if (!this.activePlan) {
      throw new Error('Not in Plan Mode. Call enterPlanMode first.');
    }

    const completed: PlanEntry = {
      ...this.activePlan,
      plan: planText,
      status: 'completed',
    };

    await writeFile(this.planFilePath(completed), this.formatPlanFile(completed), 'utf8');
    this.activePlan = null;
    this.inPlanMode = false;
    return completed;
  }

  /**
   * Get the most relevant plan entry for context injection.
   * Priority: active open plan > last completed plan > null
   */
  async getActivePlanAnchor(): Promise<PlanEntry | null> {
    if (this.activePlan) return this.activePlan;

    try {
      await this.ensurePlansDir();
      const files = await readdir(this.plansDir);

      const planFiles = files
        .filter((f) => f.endsWith('-plan.md'))
        .sort()
        .reverse(); // newest first

      for (const file of planFiles) {
        const content = await readFile(join(this.plansDir, file), 'utf8');
        const plan = this.parsePlanFile(content, file);
        return plan; // most recent completed plan
      }
    } catch {
      // dir doesn't exist yet
    }

    return null;
  }

  /**
   * Returns the plan context text for injection into the system prompt.
   */
  async getPlanContextText(): Promise<string> {
    const anchor = await this.getActivePlanAnchor();
    if (!anchor) return '';

    const statusLabel = anchor.status === 'open' ? '[PLANNING]' : '[PLANNED]';
    return [
      `## Plan Mode ${statusLabel}`,
      `Intent: ${anchor.intent}`,
      anchor.plan ? `Plan: ${anchor.plan}` : '(in progress — plan not yet defined)',
    ].join('\n');
  }

  /**
   * Filters a list of runtime actions to read-only subset.
   * Only call this when in Plan Mode.
   */
  filterReadOnlyActions(
    actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>,
  ): Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> {
    return actions.filter(isReadOnlyAction);
  }

  /**
   * Reset plan mode state. Useful for testing or recovery.
   */
  reset(): void {
    this.activePlan = null;
  }
}

/**
 * Creates the two Plan Mode runtime actions.
 * Both require access to the RuntimePlanMode instance and stepNumber provider.
 */
export function createPlanModeActions(input: {
  planMode: RuntimePlanMode;
  getCurrentStepNumber: () => number;
}) {
  const enterAction: RuntimeActionDefinition<Record<string, unknown>, unknown> = {
    name: 'enterPlanMode',
    description: 'Enter Plan Mode. After this, the agent operates in analysis/planning mode with a reduced tool set (read-only actions only — no write, execute, or mutation tools). Use this to analyze a situation, form an intent, and prepare a plan before taking irreversible actions.',
    inputSchema: {
      parse(input: unknown) {
        return enterPlanModeSchema.parse(input);
      },
    },
    execute: async (parsedInput) => {
      const { intent } = parsedInput as z.infer<typeof enterPlanModeSchema>;
      const stepNumber = input.getCurrentStepNumber();
      const plan = await input.planMode.enterPlanMode(intent, stepNumber);
      return {
        entered: true,
        planFile: `${plan.createdAt}-step-${plan.stepNumber}-plan.md`,
        status: plan.status,
      };
    },
  };

  const exitAction: RuntimeActionDefinition<Record<string, unknown>, unknown> = {
    name: 'exitPlanMode',
    description: 'Exit Plan Mode and return to normal execution (exit plan mode). Provide the final plan text summarizing what was decided during the planning phase. After this, full tool access is restored.',
    inputSchema: {
      parse(input: unknown) {
        return exitPlanModeSchema.parse(input);
      },
    },
    execute: async (parsedInput) => {
      const { plan } = parsedInput as z.infer<typeof exitPlanModeSchema>;
      const completed = await input.planMode.exitPlanMode(plan);
      return {
        exited: true,
        planFile: `${completed.createdAt}-step-${completed.stepNumber}-plan.md`,
        status: completed.status,
        intent: completed.intent,
        plan: completed.plan,
      };
    },
  };

  return { enterPlanMode: enterAction, exitPlanMode: exitAction };
}