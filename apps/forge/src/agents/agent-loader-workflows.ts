import type { CreateAgentConfig } from './agent-runtime-types';

export function filterWorkflows(
  workflows: CreateAgentConfig['workflows'],
  allowedWorkflowIds: string[] | null,
): CreateAgentConfig['workflows'] {
  if (!workflows || !allowedWorkflowIds) {
    return workflows;
  }

  const allowedWorkflowIdSet = new Set(allowedWorkflowIds);

  if (typeof workflows === 'function') {
    return async (context) => {
      const resolvedWorkflows = await workflows(context);

      return Object.fromEntries(
        Object.entries(resolvedWorkflows).filter(([, workflow]) => allowedWorkflowIdSet.has(workflow.id)),
      );
    };
  }

  return Object.fromEntries(
    Object.entries(workflows).filter(([, workflow]) => allowedWorkflowIdSet.has(workflow.id)),
  );
}
