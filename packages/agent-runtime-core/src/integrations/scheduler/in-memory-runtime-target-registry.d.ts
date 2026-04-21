import type { SchedulableRuntime } from './in-memory-runtime-scheduler.js';
import type { RuntimeTargetRegistry } from './runtime-target-registry.js';
export declare class InMemoryRuntimeTargetRegistry implements RuntimeTargetRegistry {
    private readonly runtimes;
    register(runtimeId: string, runtime: SchedulableRuntime): void;
    unregister(runtimeId: string): void;
    get(runtimeId: string): SchedulableRuntime | null;
}
