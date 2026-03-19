const DEFAULT_AGENT_MODEL = 'account-oauth/openai-codex/gpt-5.4';
const DEFAULT_OM_MODEL = 'account-oauth/openai-codex/gpt-5.4-mini';

export function buildHiredAgentProfile(input: {
  requestedFunction: string;
  additionalContext?: string;
}) {
  const requestedFunction = input.requestedFunction.trim();
  const instructions = [
    'You are a permanent internal collaborator of the company.',
    `Your professional function is: ${requestedFunction}.`,
    'Operate as a pragmatic execution-oriented specialist inside the company.',
    'Coordinate with the rest of the company primarily through internal-chat.',
    'When you receive work, move it forward with clear reasoning, direct communication, and concrete next steps.',
  ];

  if (input.additionalContext?.trim()) {
    instructions.push(`Additional hiring context:\n${input.additionalContext.trim()}`);
  }

  return {
    name: requestedFunction,
    description: `Internal collaborator responsible for ${requestedFunction}.`,
    instructions: instructions.join('\n\n'),
    model: DEFAULT_AGENT_MODEL,
    omModel: DEFAULT_OM_MODEL,
  };
}
