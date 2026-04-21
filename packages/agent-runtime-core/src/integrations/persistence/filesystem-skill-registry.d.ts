import type { SkillDefinition, SkillRegistry } from '../skills/contracts.js';
export type FilesystemSkillRegistryOptions = {
    basePath: string;
};
export declare class FilesystemSkillRegistry implements SkillRegistry {
    private readonly basePath;
    constructor(options: FilesystemSkillRegistryOptions);
    register(skill: SkillDefinition): Promise<void>;
    remove(skillId: string): Promise<void>;
    get(skillId: string): Promise<SkillDefinition | null>;
    list(): Promise<SkillDefinition[]>;
    private getFilePath;
}
