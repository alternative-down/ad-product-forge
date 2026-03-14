export function getDefaultAgentRunOptions(agentId: string) {
  return {
    memory: {
      thread: agentId,
      resource: agentId,
    },
    maxSteps: 1000,
  };
}
