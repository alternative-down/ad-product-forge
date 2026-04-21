export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  metadata?: Record<string, unknown>;
};

export interface SkillRegistry {
  register(skill: SkillDefinition): Promise<void>;
  remove(skillId: string): Promise<void>;
  get(skillId: string): Promise<SkillDefinition | null>;
  list(): Promise<SkillDefinition[]>;
}
