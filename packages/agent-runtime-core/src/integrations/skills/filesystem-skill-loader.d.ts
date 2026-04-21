import type { SkillDefinition, SkillRegistry } from './contracts.js';
export type FilesystemSkillLoaderOptions = {
    basePath: string;
};
export declare function loadSkillsFromDirectory(options: FilesystemSkillLoaderOptions): Promise<SkillDefinition[]>;
export declare function loadSkillsIntoRegistry(registry: SkillRegistry, options: FilesystemSkillLoaderOptions): Promise<SkillDefinition[]>;
