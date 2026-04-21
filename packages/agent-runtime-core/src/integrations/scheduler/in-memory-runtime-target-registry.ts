import type { SchedulableRuntime } from './in-memory-runtime-scheduler.js';
import type { RuntimeTargetRegistry } from './runtime-target-registry.js';

export class InMemoryRuntimeTargetRegistry implements RuntimeTargetRegistry {
  private readonly runtimes = new Map<string, SchedulableRuntime>();

  register(runtimeId: string, runtime: SchedulableRuntime): void {
    this.runtimes.set(runtimeId, runtime);
  }

  unregister(runtimeId: string): void {
    this.runtimes.delete(runtimeId);
  }

  get(runtimeId: string): SchedulableRuntime | null {
    return this.runtimes.get(runtimeId) ?? null;
  }
}
