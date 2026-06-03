import type { SkillDefinition, SkillRegistry } from './contracts.js';

export class InMemorySkillRegistry implements SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  async register(skill: SkillDefinition): Promise<void> {
    await Promise.resolve();
    this.skills.set(skill.id, skill);
  }

  async remove(skillId: string): Promise<void> {
    await Promise.resolve();
    this.skills.delete(skillId);
  }

  async get(skillId: string): Promise<SkillDefinition | null> {
    await Promise.resolve();
    return this.skills.get(skillId) ?? null;
  }

  async list(): Promise<SkillDefinition[]> {
    await Promise.resolve();
    return Array.from(this.skills.values());
  }
}
