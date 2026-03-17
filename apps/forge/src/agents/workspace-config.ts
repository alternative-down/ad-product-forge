/**
 * Workspace configuration types for agent filesystem and sandbox
 */

export interface WorkspaceFilesystemConfig {
  basePath: string;
}

export interface WorkspaceSandboxConfig {
  workingDirectory: string;
}

/**
 * Parse and validate workspace filesystem configuration from JSON string
 */
export function parseWorkspaceFilesystem(json: string | null | undefined): WorkspaceFilesystemConfig | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null && 'basePath' in parsed && typeof parsed.basePath === 'string') {
      return parsed as WorkspaceFilesystemConfig;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse and validate workspace sandbox configuration from JSON string
 */
export function parseWorkspaceSandbox(json: string | null | undefined): WorkspaceSandboxConfig | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null && 'workingDirectory' in parsed && typeof parsed.workingDirectory === 'string') {
      return parsed as WorkspaceSandboxConfig;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
