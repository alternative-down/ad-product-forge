export function buildAgentSystemPrompt(input: {
  instructions: string;
  agentId: string;
  agentSlug: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
  companyName?: string;
  companyContext?: string;
}): string;
export function buildAgentSystemPrompt<T>(input: {
  instructions: T;
  agentId: string;
  agentSlug: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
  companyName?: string;
  companyContext?: string;
}): T;
export function buildAgentSystemPrompt(input: {
  instructions: unknown;
  agentId: string;
  agentSlug: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
  companyName?: string;
  companyContext?: string;
}) {
  if (typeof input.instructions !== 'string') {
    return input.instructions;
  }

  const agentContextFilePath = 'AGENT_CONTEXT.md';

  const sections = [
    [
      '<agent_identity>',
      '## Agent Identity',
      `- Agent id: ${input.agentId}`,
      `- Agent slug: ${input.agentSlug}`,
      `- Agent name: ${input.agentName}`,
      input.agentDescription !== null &&
      input.agentDescription !== undefined &&
      input.agentDescription.trim()
        ? `- Agent description: ${input.agentDescription.trim()}`
        : null,
      input.roleName !== null && input.roleName !== undefined && input.roleName.trim()
        ? `- Role name: ${input.roleName.trim()}`
        : null,
      input.roleDescription !== null &&
      input.roleDescription !== undefined &&
      input.roleDescription.trim()
        ? `- Role description: ${input.roleDescription.trim()}`
        : null,
      '</agent_identity>',
    ]
      .filter(Boolean)
      .join('\n'),
    [
      '<company_context>',
      '## Company Context',
      input.companyName !== null && input.companyName !== undefined && input.companyName.trim()
        ? `- Company name: ${input.companyName.trim()}`
        : null,
      input.companyContext !== null &&
      input.companyContext !== undefined &&
      input.companyContext.trim()
        ? `- Company information: ${input.companyContext.trim()}`
        : null,
      '</company_context>',
    ]
      .filter(Boolean)
      .join('\n'),
    [
      '<assigned_instructions>',
      '## Assigned Instructions',
      input.instructions.trim(),
      '</assigned_instructions>',
    ].join('\n'),
    [
      '<operating_directives>',
      '## Operating Directives',
      '- This is a real operating environment for a real company running through software. It is not a simulation, game, or roleplay.',
      '- Follow your assigned role and instructions. Act on work inside that scope; coordinate or report work owned by another role instead of taking it over.',
      '- Work proactively from the available messages, notifications, schedules, tools, workspace, and company state. Continue with the next useful action while relevant work remains.',
      '- Prioritize impact, dependency unblocking, critical information gathering, risk reduction, and then optimization.',
      '- Verify facts before acting. Do not speculate, emulate, invent results, or claim work that was not actually checked or completed.',
      '- Resolve low-risk ambiguity from available context. Ask only when authority is missing, an action is hard to reverse, realistic choices have materially different consequences, or goals conflict.',
      '- In group conversations, speak only when addressed, responsible for the next step, or able to add a material fact, decision, or action. Do not repeat what participants already know or answer on someone else’s behalf.',
      '- Use workspace files as your private operational notebook. Keep durable supporting knowledge under `memory/`, organized and current.',
      `- Keep \`${agentContextFilePath}\` in the workspace root as a concise, high-signal summary of current context and pointers to deeper files. The runtime automatically loads it for the first model step of each run.`,
      '</operating_directives>',
    ].join('\n'),
    [
      '<execution_environment>',
      '## Execution Environment',
      '- This runtime is not a conventional chat window. Plain text output remains inside the agent execution and is not delivered to the person or agent that triggered the run.',
      '- Your workspace is isolated from the workspaces of other agents. Files in your workspace are private unless you explicitly share or send them.',
      '- Deliver a reply or update only through a successful `send_message` tool call.',
      '- The current run only stops when you explicitly respond with `STOP_AND_IDLE` and do not call a tool.',
      '- `NO_ACTION_NEEDED` does not stop the run. It only tells the system to ignore that visible text and continue.',
      '- Use `STOP_AND_IDLE` only when no relevant action, verification, follow-up, or coordination remains available inside your role.',
      '</execution_environment>',
    ].join('\n'),
  ];

  return sections.join('\n\n');
}
