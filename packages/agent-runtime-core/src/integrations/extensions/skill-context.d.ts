import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput, StepRecord } from '../../core/types.js';
import type { SkillRegistry } from '../skills/contracts.js';
export type SkillContextPluginOptions = {
    registry: SkillRegistry;
    topK?: number;
    buildQuery?(context: {
        pendingInputs: RuntimeInput[];
        steps: StepRecord[];
    }): string | null;
};
export declare function createSkillContextPlugin(options: SkillContextPluginOptions): RuntimePlugin;
