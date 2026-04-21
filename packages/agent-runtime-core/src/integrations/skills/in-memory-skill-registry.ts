import type { SkillDefinition, SkillRegistry } from './contracts.js';

export class InMemorySkillRegistry implements SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  async register(skill: SkillDefinition): Promise<void> {
    this.skills.set(skill.id, skill);
  }

  async remove(skillId: string): Promise<void> {
    this.skills.delete(skillId);
  }

  async get(skillId: string): Promise<SkillDefinition | null> {
    return this.skills.get(skillId) ?? null;
  }

  async list(): Promise<SkillDefinition[]> {
    return Array.from(this.skills.values());
  }
}
