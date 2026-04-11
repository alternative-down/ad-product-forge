import { z } from 'zod';

const workingMemoryText = (description: string) =>
  z
    .string()
    .optional()
    .describe(description);

export const WORKING_MEMORY_INSTRUCTIONS = [
  'Working memory is an actively maintained operating memory.',
  'Update it as soon as something meaningfully changes in your active rules, domain expansion, or current objectives.',
  'When several related fields changed, update them together in one working-memory update instead of making multiple fragmented updates.',
  'Use working memory only for stable rules, domain expansion, and current objectives.',
  'Use domain expansion to capture the practical shape of your area inside the limits of your role: what belongs to your function, how your work is usually done, what kinds of activities fit your scope, and what operational territory is legitimately yours beyond the base role text without expanding into another role.',
  'Do not duplicate the system prompt, role text, tool descriptions, obvious runtime behavior, full conversation history, or information that is easy to find elsewhere.',
  'Keep every field concise, information-dense, and easy to scan.',
  'Remove or rewrite entries when they are resolved, replaced, no longer true, or no longer useful.',
  'Prefer compact bullets or short paragraphs inside each field.',
  'Use objectives for what you are currently trying to achieve, and update them when priorities shift.',
].join('\n');

export const WORKING_MEMORY_SCHEMA = z.object({
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
}).describe(
  'Structured working memory for rules, domain expansion, and objectives.',
);

export function appendWorkingMemoryInstructions(instructions: string): string;
export function appendWorkingMemoryInstructions<T>(instructions: T): T;
export function appendWorkingMemoryInstructions(instructions: unknown) {
  if (typeof instructions !== 'string') {
    return instructions;
  }

  return `${instructions}\n\n${WORKING_MEMORY_INSTRUCTIONS}`;
}
