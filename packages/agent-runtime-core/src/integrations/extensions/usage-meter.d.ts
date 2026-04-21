import type { RuntimePlugin } from '../../core/plugins.js';
import type { UsageMeter } from '../usage/contracts.js';
export type UsageMeterPluginOptions = {
    name?: string;
    meter: UsageMeter;
};
export declare function createUsageMeterPlugin(options: UsageMeterPluginOptions): RuntimePlugin;
