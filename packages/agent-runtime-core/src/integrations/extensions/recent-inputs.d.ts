import type { RuntimePlugin } from '../../core/plugins.js';
export type RecentInputsPluginOptions = {
    name?: string;
    maxInputs?: number;
};
export declare function createRecentInputsPlugin(options?: RecentInputsPluginOptions): RuntimePlugin;
