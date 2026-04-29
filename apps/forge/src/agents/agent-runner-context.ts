const CONTEXT_DECORATION_TIMEOUT_MS = 5_000;
const AGENT_CONTEXT_FILE_PATH = 'AGENT_CONTEXT.md';
const AGENT_CONTEXT_WARNING_CHAR_LIMIT = 7_417;
const WORKING_MEMORY_WARNING_CHAR_LIMIT = 4_000;

const PREAMBLE = [
  'Automatically loaded workspace context file.',
  `File: ${AGENT_CONTEXT_FILE_PATH}`,
  'This file should be treated as additional runtime instructions and context.',
  'This is the only workspace file auto-loaded into the execution context.',
  'Treat it as a concise summary layer. Keep details in other files and store only high-signal references here when needed.',
  'If you mention or use information from this file, do not say it came from context, instructions, notes, or memory. Use active language such as "I remember that...", "we already saw that...", or "on day X in the morning I did X" when appropriate.',
  '',
].join('\n');

export type ContextLoaderDependencies = {
  getRuntimeHome(): Promise<string>;
};

export function createContextLoader(deps: ContextLoaderDependencies) {
  async function loadAgentContextInstructions(): Promise<string> {
    const home = await deps.getRuntimeHome();

    try {
      const { readFile } = await import('fs/promises');
      const contextPath = `${home}/${AGENT_CONTEXT_FILE_PATH}`;
      const content = await readFile(contextPath, 'utf-8');
      const decorated = decorateContext(content);

      if (!decorated) {
        return '';
      }

      return [PREAMBLE, decorated].join('\n');
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
        'Context pressure warning:',
        `- \`${AGENT_CONTEXT_FILE_PATH}\` is getting large (${trimmed.length} chars).`,
        '- Keep only high-signal summary context there.',
        '- Move detailed notes, logs, and long task detail into separate workspace files.',
        '- Leave short retrieval hints and file references in `AGENT_CONTEXT.md`.',
        '',
        trimmed,
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
