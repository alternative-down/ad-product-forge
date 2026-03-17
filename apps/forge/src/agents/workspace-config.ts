import { z } from 'zod';

const WorkspaceFilesystemConfigSchema = z.object({
  basePath: z.string(),
});

const WorkspaceSandboxConfigSchema = z.object({
  workingDirectory: z.string(),
});

export type WorkspaceFilesystemConfig = z.infer<typeof WorkspaceFilesystemConfigSchema>;
export type WorkspaceSandboxConfig = z.infer<typeof WorkspaceSandboxConfigSchema>;

/**
 * Parse and validate workspace filesystem configuration from JSON string
 */
export function parseWorkspaceFilesystem(json: string | null | undefined): WorkspaceFilesystemConfig | undefined {
  if (!json) return undefined;
  try {
    return WorkspaceFilesystemConfigSchema.parse(JSON.parse(json));
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
    return WorkspaceSandboxConfigSchema.parse(JSON.parse(json));
  } catch {
    return undefined;
  }
}
