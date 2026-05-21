export type AgentMcpServerInput =
  | {
      agentId: string;

      name: string;

      description?: string;

      transport: 'stdio';

      command: string;

      argsText?: string;

      envVarsText?: string;

      isActive: boolean;
    }
  | {
      agentId: string;

      name: string;

      description?: string;

      transport: 'http_streamable';

      url: string;

      headersText?: string;

      isActive: boolean;
    };

export type UpdateAgentMcpServerInput = {
  configId: string;

  serverId: string;
} & AgentMcpServerInput;
