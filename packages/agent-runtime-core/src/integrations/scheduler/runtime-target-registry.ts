import type { SchedulableRuntime } from './in-memory-runtime-scheduler.js';

export interface RuntimeTargetRegistry {
  register(runtimeId: string, runtime: SchedulableRuntime): void;
  unregister(runtimeId: string): void;
  get(runtimeId: string): SchedulableRuntime | null;
}
