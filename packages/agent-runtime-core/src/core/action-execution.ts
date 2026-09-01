import type { ActionResult, ActionRequest } from './types.js';

export type ActionExecutor = (actionRequest: ActionRequest) => Promise<ActionResult>;

export type ActionExecutionStrategy = {
  execute(actionRequests: ActionRequest[], executeAction: ActionExecutor): Promise<ActionResult[]>;
};

export function createSequentialActionExecutionStrategy(): ActionExecutionStrategy {
  return {
    async execute(actionRequests, executeAction) {
      const results: ActionResult[] = [];

      for (const actionRequest of actionRequests) {
        results.push(await executeAction(actionRequest));
      }

      return results;
    },
  };
}

export function createParallelActionExecutionStrategy(): ActionExecutionStrategy {
  return {
    async execute(actionRequests, executeAction) {
      return await Promise.all(actionRequests.map((actionRequest) => executeAction(actionRequest)));
    },
  };
}
