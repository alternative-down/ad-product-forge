import { z } from 'zod';

const workingMemoryText = (description: string) =>
  z
    .string()
    .optional()
    .describe(description);

export const WORKING_MEMORY_INSTRUCTIONS = [
  'Working memory is your intrinsic operating core, not your notebook.',
  'Use it for identity-level guidance that should remain true across runs unless something genuinely changed.',
  'Update it when something meaningfully changes in your role core, non-negotiables, domain boundaries, or current mission and direction.',
  'When several related fields changed, update them together in one working-memory update instead of making multiple fragmented updates.',
  'Use working memory only for intrinsic guidance: identity, stable rules, domain boundaries, and current mission-level direction.',
  'Do not use working memory as a task log, notebook, timeline, dump of recent findings, or storage for operational detail that should live in workspace files.',
  'Use it for things like: the core of your role, non-negotiable constraints, operating principles that define how you should behave, the true boundaries of your area, the mission you are currently advancing, and what success means at a high level.',
  'Use domain information to capture what belongs to your function in practice, what kinds of activities are legitimately inside your role, and where the boundaries are without drifting into another function.',
  'Do not duplicate the system prompt, role text, tool descriptions, obvious runtime behavior, full conversation history, or information that is easy to find elsewhere.',
  'Keep every field clear, information-dense, and descriptive enough to avoid ambiguity without becoming verbose.',
  'Remove or rewrite entries when they are resolved, replaced, no longer true, or no longer useful.',
  'Prefer compact bullets or short paragraphs inside each field.',
  'Use direction for what you are currently trying to achieve at a high level, why it matters, and what success means.',
  'If you mention or use information from working memory, do not say it came from working memory, memory, or context. Use active language such as "I remember that...", "we already saw that...", or "on day X in the morning I did X" when appropriate.',
].join('\n');

export const WORKING_MEMORY_SCHEMA = z.object({
  identity: z
    .object({
      roleCore: workingMemoryText(
        'Role core.',
      ),
      nonNegotiables: workingMemoryText(
        'Hard rules and prohibitions.',
      ),
      operatingPrinciples: workingMemoryText(
        'Stable operating principles.',
      ),
    })
    .optional()
    .describe('Identity.'),
  domain: z
    .object({
      scope: workingMemoryText(
        'Role scope.',
      ),
      activities: workingMemoryText(
        'Typical activities.',
      ),
      boundaries: workingMemoryText(
        'Role boundaries.',
      ),
    })
    .optional()
    .describe('Domain.'),
  direction: z
    .object({
      currentMission: workingMemoryText(
        'Current mission.',
      ),
      successDefinition: workingMemoryText(
        'Success definition.',
      ),
    })
    .optional()
    .describe('Direction.'),
}).describe('Structured working memory.');

export const WORKING_MEMORY_UPDATE_SCHEMA = z.object({
  identity: z.object({
    roleCore: z.string().optional(),
    nonNegotiables: z.string().optional(),
    operatingPrinciples: z.string().optional(),
  }).partial().optional(),
  domain: z.object({
    scope: z.string().optional(),
    activities: z.string().optional(),
    boundaries: z.string().optional(),
  }).partial().optional(),
  direction: z.object({
    currentMission: z.string().optional(),
    successDefinition: z.string().optional(),
  }).partial().optional(),
}).describe('Partial working memory update.');

export type WorkingMemoryAccess = {
  getWorkingMemory(input: {
    threadId: string;
    resourceId?: string;
  }): Promise<string | null | undefined>;
  updateWorkingMemory(input: {
    threadId: string;
    resourceId?: string;
    workingMemory: string;
  }): Promise<void>;
};

export function appendWorkingMemoryInstructions(instructions: string): string;
export function appendWorkingMemoryInstructions<T>(instructions: T): T;
export function appendWorkingMemoryInstructions(instructions: unknown) {
  if (typeof instructions !== 'string') {
    return instructions;
  }

  return `${instructions}\n\n${WORKING_MEMORY_INSTRUCTIONS}`;
}

export async function sanitizeWorkingMemory(input: {
  memory: WorkingMemoryAccess;
  threadId: string;
  resourceId?: string;
}) {
  const currentWorkingMemory = await input.memory.getWorkingMemory({
    threadId: input.threadId,
    resourceId: input.resourceId,
  });

  if (typeof currentWorkingMemory !== 'string' || currentWorkingMemory.trim().length === 0) {
    return;
  }

  const parsedCurrentWorkingMemory = parseStoredWorkingMemory(currentWorkingMemory);
  const sanitizedWorkingMemory = WORKING_MEMORY_SCHEMA.safeParse(parsedCurrentWorkingMemory);
  const normalizedWorkingMemory = JSON.stringify(sanitizedWorkingMemory.success ? sanitizedWorkingMemory.data : {});

  if (normalizedWorkingMemory === currentWorkingMemory) {
    return;
  }

  await input.memory.updateWorkingMemory({
    threadId: input.threadId,
    resourceId: input.resourceId,
    workingMemory: normalizedWorkingMemory,
  });
}

function parseStoredWorkingMemory(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
