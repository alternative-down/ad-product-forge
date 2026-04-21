import type { ActionResult, ActionRequest } from './types.js';
export type ActionExecutor = (actionRequest: ActionRequest) => Promise<ActionResult>;
export type ActionExecutionStrategy = {
    execute(actionRequests: ActionRequest[], executeAction: ActionExecutor): Promise<ActionResult[]>;
};
export declare function createSequentialActionExecutionStrategy(): ActionExecutionStrategy;
export declare function createParallelActionExecutionStrategy(): ActionExecutionStrategy;
