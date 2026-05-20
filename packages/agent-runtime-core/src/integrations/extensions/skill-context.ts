import { createTextStepContextEntry } from '../../core/step-context.js';
import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput, StepContextEntry, StepRecord } from '../../core/types.js';
import type { SkillDefinition, SkillRegistry } from '../skills/contracts.js';

export type SkillContextPluginOptions = {
  registry: SkillRegistry;
  topK?: number;
  buildQuery?(context: { pendingInputs: RuntimeInput[]; steps: StepRecord[] }): string | null;
};

export function createSkillContextPlugin(options: SkillContextPluginOptions): RuntimePlugin {
  return {
    name: 'skill-context',
    async provideContext(context) {
      const query = options.buildQuery
        ? options.buildQuery({
            pendingInputs: context.pendingInputs,
            steps: context.steps,
          })
        : buildDefaultSkillQuery(context.pendingInputs);

      if (!query) {
        return [];
      }

      const skills = await options.registry.list();
      const matches = skills
        .map((skill) => ({
          skill,
          score: scoreSkill(skill, query),
        }))
        .filter((match) => match.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, options.topK ?? 3);

      return matches.map(
        ({ skill }, index): StepContextEntry =>
          createTextStepContextEntry({
            id: `skill:${skill.id}`,
            kind: 'skill',
            title: `Skill ${index + 1}: ${skill.name}`,
            text: `${skill.description}\n\n${skill.instructions}`,
          }),
      );
    },
  };
}

function buildDefaultSkillQuery(pendingInputs: RuntimeInput[]) {
  const payloads = pendingInputs
    .map((input) => JSON.stringify(input.payload))
    .filter((value) => typeof value === 'string')
    .join(' ');

  return payloads.trim() ?? null;
}

function scoreSkill(skill: SkillDefinition, query: string) {
  const haystack = `${skill.name} ${skill.description} ${skill.instructions}`.toLowerCase();
  const queryTerms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter(Boolean);

  return queryTerms.reduce((score, term) => (haystack.includes(term) ? score + 1 : score), 0);
}
