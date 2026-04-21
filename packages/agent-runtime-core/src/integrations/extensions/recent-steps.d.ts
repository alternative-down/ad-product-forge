import type { RuntimePlugin } from '../../core/plugins.js';
import type { StepContentSegment } from '../../core/types.js';
export type RecentStepsPluginOptions = {
    name?: string;
    maxSteps?: number;
    includeKinds?: StepContentSegment['kind'][];
};
export declare function createRecentStepsPlugin(options?: RecentStepsPluginOptions): RuntimePlugin;
