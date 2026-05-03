import { withTimeout } from '../utils/async';
import {
  AGENT_CONTEXT_WARNING_CHAR_LIMIT,
  WORKING_MEMORY_WARNING_CHAR_LIMIT,
  AGENT_CONTEXT_FILE_PATH,
} from './constants';
const CONTEXT_DECORATION_TIMEOUT_MS = 5_000;
const RUNNER_AWAIT_TIMEOUT_MS = 30_000;

export type WorkspaceFilesystem = {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string | Uint8Array | Buffer>;
};

export type ContextLoaderDependencies = {
  filesystem: WorkspaceFilesystem;
};

export function createContextLoader(deps: ContextLoaderDependencies) {
  const { filesystem } = deps;

  async function loadAgentContextInstructions(): Promise<string> {
    const contextPath = `${AGENT_CONTEXT_FILE_PATH}`;

    try {
      const fileExists = await withTimeout(
        filesystem.exists(contextPath),
        CONTEXT_DECORATION_TIMEOUT_MS,
        'Context file existence check timed out',
      );

      if (!fileExists) {
        return '';
      }

      const rawContent = await withTimeout(
        filesystem.readFile(contextPath),
        CONTEXT_DECORATION_TIMEOUT_MS,
        'Context file read timed out',
      );

      if (!rawContent) {
        return '';
      }

      const content = toString(rawContent);
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


function toString(data: string | Uint8Array | Buffer): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf-8');
  // Uint8Array — use TextDecoder for proper UTF-8 decode
  return new TextDecoder('utf-8').decode(data);
}
