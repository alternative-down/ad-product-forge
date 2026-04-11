import { z } from 'zod';

const workingMemoryText = (description: string) =>
  z
    .string()
    .optional()
    .describe(description);

export const WORKING_MEMORY_INSTRUCTIONS = [
  'Working memory is an actively maintained operating memory.',
  'Update it as soon as something meaningfully changes in your durable knowledge, rules, pending track, objectives, or task direction.',
  'When several related fields changed, update them together in one working-memory update instead of making multiple fragmented updates.',
  'Use working memory for consolidated facts, stable rules, learned patterns, medium-lived observations, current objectives, and tracked tasks.',
  'Use domain expansion to capture the practical shape of your area inside the limits of your role: what belongs to your function, how your work is usually done, what kinds of activities fit your scope, and what operational territory is legitimately yours beyond the base role text without expanding into another role.',
  'Do not duplicate the system prompt, role text, tool descriptions, obvious runtime behavior, full conversation history, or information that is easy to find elsewhere.',
  'If something should stay discoverable but is already stored elsewhere, keep only a short reference or a note explaining where to find it.',
  'Keep every field concise, information-dense, and easy to scan.',
  'Remove or rewrite entries when they are resolved, replaced, no longer true, or no longer useful.',
  'Prefer compact bullets or short paragraphs inside each field.',
  'Use observations for temporary but still useful tracking, not for permanent truth.',
  'Use tasks for active next actions and blocked work, not for vague intentions.',
  'Use objectives for what you are currently trying to achieve, and update them when priorities shift.',
].join('\n');

export const WORKING_MEMORY_SCHEMA = z.object({
  facts: z
    .object({
      identity: workingMemoryText(
        'Core identity and stable self-description that remains useful across runs.',
      ),
      stableContext: workingMemoryText(
        'Consolidated background facts, durable context, or low-change truths worth keeping in memory.',
      ),
      lookupHints: workingMemoryText(
        'Short references to where larger or easier-to-find information lives instead of duplicating it.',
      ),
    })
    .optional()
    .describe('Durable facts and stable context that should remain available over time.'),
  rules: z
    .object({
      obligations: workingMemoryText(
        'Standing responsibilities, commitments, and instructions that the agent must keep following.',
      ),
      constraints: workingMemoryText(
        'Hard limits, prohibitions, approval boundaries, or things the agent must avoid doing.',
      ),
      preferences: workingMemoryText(
        'Stable operating preferences or recurring ways of working that remain useful across runs.',
      ),
    })
    .optional()
    .describe('What to do, what not to do, and stable operating rules.'),
  domainExpansion: z
    .object({
      area: workingMemoryText(
        'Expanded description of the agent area inside the limits of the role, what the function really covers in practice, and what belongs inside that domain without drifting into another function.',
      ),
      methods: workingMemoryText(
        'How the agent usually works, recurring operating approaches, and practical ways the role executes its responsibilities.',
      ),
      activities: workingMemoryText(
        'Types of activities, initiatives, reviews, decisions, and follow-ups that are legitimately part of this role.',
      ),
      scopeEdges: workingMemoryText(
        'Clarifications about the edges of the role: what is inside scope, what is adjacent, and what should only be handled in a supporting or coordinating way.',
      ),
    })
    .optional()
    .describe('Expanded model of the agent domain, area of action, ways of working, and practical scope while staying inside the role boundaries.'),
  learnings: z
    .object({
      product: workingMemoryText(
        'Important learned truths about products, customers, positioning, or business behavior.',
      ),
      technical: workingMemoryText(
        'Important learned truths about systems, tooling, code, infra, or technical constraints.',
      ),
      operational: workingMemoryText(
        'Important learned truths about routines, coordination, workflows, or execution patterns.',
      ),
    })
    .optional()
    .describe('Learnings and inferences that became useful knowledge after analysis or repeated observation.'),
  observations: z
    .object({
      activeNotes: workingMemoryText(
        'Medium-lived notes worth tracking for a while, including pending checks and things to revisit.',
      ),
      risks: workingMemoryText(
        'Current risks, uncertainties, or watch items that still matter and may require follow-up.',
      ),
      pendingReview: workingMemoryText(
        'Items that should be reviewed later because they are unresolved, waiting, or need confirmation.',
      ),
    })
    .optional()
    .describe('Temporary but useful notes that help the agent maintain track of ongoing reality.'),
  objectives: z
    .object({
      current: workingMemoryText(
        'Current goals, desired outcomes, or what the agent is actively trying to achieve now.',
      ),
      rationale: workingMemoryText(
        'Why the current objectives matter and what success looks like at a high level.',
      ),
    })
    .optional()
    .describe('Active objectives and what the agent is currently trying to accomplish.'),
  tasks: z
    .object({
      nextActions: workingMemoryText(
        'Concrete next actions or active task track aligned with the current objectives.',
      ),
      blocked: workingMemoryText(
        'Blocked work, dependencies, or waiting points that still need follow-up later.',
      ),
      doneRecently: workingMemoryText(
        'Very short summary of recently completed meaningful steps only when still useful for continuity.',
      ),
    })
    .optional()
    .describe('Tracked tasks, next actions, and blocked items that help maintain continuity.'),
}).describe(
  'Structured working memory for durable facts, rules, domain expansion, learnings, observations, objectives, and tasks.',
);

export function appendWorkingMemoryInstructions(instructions: string): string;
export function appendWorkingMemoryInstructions<T>(instructions: T): T;
export function appendWorkingMemoryInstructions(instructions: unknown) {
  if (typeof instructions !== 'string') {
    return instructions;
  }

  return `${instructions}\n\n${WORKING_MEMORY_INSTRUCTIONS}`;
}
