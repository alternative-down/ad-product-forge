const CONTEXT_DECORATION_TIMEOUT_MS = 5_000;
const RUNNER_AWAIT_TIMEOUT_MS = 30_000;
const AGENT_CONTEXT_FILE_PATH = 'AGENT_CONTEXT.md';
const AGENT_CONTEXT_WARNING_CHAR_LIMIT = 8_000;
const WORKING_MEMORY_WARNING_CHAR_LIMIT = 4_000;

export type ContextLoaderDependencies = {
  getRuntimeHome(): Promise<string>;
  getAgentContextInstructions(): Promise<string>;
};

export function createContextLoader(deps: ContextLoaderDependencies) {
  async function loadAgentContextInstructions(): Promise<string> {
    const home = await deps.getRuntimeHome();

    try {
      const { readFile } = await import('fs/promises');
      const contextPath = `${home}/${AGENT_CONTEXT_FILE_PATH}`;
      const content = await readFile(contextPath, 'utf-8');
      return decorateContext(content);
    } catch {
      // File doesn't exist or can't be read — use default
      return '';
    }
  }

  function decorateContext(content: string): string {
    const trimmed = content.trim();

    if (!trimmed) {
      return '';
    }

    // Warn about oversized context files
    if (trimmed.length > AGENT_CONTEXT_WARNING_CHAR_LIMIT) {
      return [
        `${trimmed}`,
        '',
        `> ⚠️ Context file is ${trimmed.length} chars — above the ${AGENT_CONTEXT_WARNING_CHAR_LIMIT} char warning threshold.`,
        `> Keep AGENT_CONTEXT.md concise. Move detail to dedicated workspace files.`,
      ].join('\n');
    }

    return trimmed;
  }

  async function loadRuntimeContext(): Promise<string | null> {
    return loadAgentContextInstructions();
  }

  function buildStepSystemPrompt(input: {
    agentContextInstructions: string;
  }): string | null {
    const { agentContextInstructions } = input;

    if (!agentContextInstructions.trim()) {
      return null;
    }

    return [
      'You have access to the following agent context:',
      '',
      agentContextInstructions,
    ].join('\n');
  }

  return {
    loadAgentContextInstructions,
    loadRuntimeContext,
    buildStepSystemPrompt,
  };
}
