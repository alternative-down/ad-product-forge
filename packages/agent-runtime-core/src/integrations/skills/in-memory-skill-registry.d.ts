import type { SkillDefinition, SkillRegistry } from './contracts.js';
export declare class InMemorySkillRegistry implements SkillRegistry {
    private readonly skills;
    register(skill: SkillDefinition): Promise<void>;
    remove(skillId: string): Promise<void>;
    get(skillId: string): Promise<SkillDefinition | null>;
    list(): Promise<SkillDefinition[]>;
}
