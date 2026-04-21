import type { RuntimePlugin } from '../../core/plugins.js';
import type { OperationalMemory } from '../memory/operational-memory.js';
export type OperationalMemoryPluginOptions = {
    memory: OperationalMemory;
    renderCurrentStepInputs?: boolean;
};
export declare function createOperationalMemoryPlugin(options: OperationalMemoryPluginOptions): RuntimePlugin;
