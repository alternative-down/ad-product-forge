const DEFAULT_AGENT_MODEL = 'account-oauth/openai-codex/gpt-5.4';
const DEFAULT_OM_MODEL = 'account-oauth/openai-codex/gpt-5.4-mini';

export function buildHiredAgentProfile(input: {
  requestedFunction: string;
}) {
  const requestedFunction = input.requestedFunction.trim();

  return {
    name: requestedFunction,
    description: `Internal collaborator responsible for ${requestedFunction}.`,
    model: DEFAULT_AGENT_MODEL,
    omModel: DEFAULT_OM_MODEL,
  };
}
