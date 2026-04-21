import { z } from 'zod';
import type { ActionResult, StepActionDescriptor } from './types.js';
export type RuntimeActionContext = {
    runtimeId: string;
    stepId: string;
    stepNumber: number;
};
export type RuntimeActionDefinition<TInput extends Record<string, unknown>, TOutput> = {
    name: string;
    description: string;
    inputSchema: z.ZodType<TInput>;
    execute(input: TInput, context: RuntimeActionContext): Promise<TOutput> | TOutput;
};
export declare class RuntimeActionRegistry {
    private readonly actions;
    register<TInput extends Record<string, unknown>, TOutput>(action: RuntimeActionDefinition<TInput, TOutput>): void;
    describe(): StepActionDescriptor[];
    execute(name: string, input: Record<string, unknown>, context: RuntimeActionContext): Promise<ActionResult>;
}
