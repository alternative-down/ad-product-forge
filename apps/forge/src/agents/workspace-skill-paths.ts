import path from 'node:path';

import { WorkspaceFilesystemConfigSchema } from '../database/schema';
import type { Agent, WorkspaceFilesystemConfig } from '../database/schema';
import { parseWorkspaceJsonConfig } from './agent-loader-runtime-config';

export function resolveAgentWorkspaceRoot(
  workspaceBasePath: string,
  workspaceFilesystem: WorkspaceFilesystemConfig | null | undefined,
  agentId: string,
) {
  const agentWorkspacePath = path.resolve(workspaceBasePath, agentId);

  return workspaceFilesystem && workspaceFilesystem.basePath
    ? path.resolve(agentWorkspacePath, workspaceFilesystem.basePath)
    : path.resolve(agentWorkspacePath, 'workspace');
}

export function resolveAgentSkillsRoot(
  workspaceBasePath: string,
  workspaceFilesystem: WorkspaceFilesystemConfig | null | undefined,
  agentId: string,
) {
  return path.resolve(
    resolveAgentWorkspaceRoot(workspaceBasePath, workspaceFilesystem, agentId),
    'skills',
  );
}

export function resolveAgentSkillRoot(input: {
  workspaceBasePath: string;
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>;
  skillName: string;
}) {
  const skillsRoot = resolveAgentSkillsRoot(
    input.workspaceBasePath,
    parseWorkspaceJsonConfig(input.agent.workspaceFilesystem, WorkspaceFilesystemConfigSchema),
    input.agent.id,
  );

  return {
    skillsRoot,
    skillRoot: path.resolve(skillsRoot, input.skillName),
  };
}
