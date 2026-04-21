import type { RuntimePlugin } from '../../core/plugins.js';
import type { StepContextEntry } from '../../core/types.js';
export type StaticContextPluginOptions = {
    name?: string;
    entries: StepContextEntry[] | (() => StepContextEntry[] | Promise<StepContextEntry[]>);
};
export declare function createStaticContextPlugin(options: StaticContextPluginOptions): RuntimePlugin;
