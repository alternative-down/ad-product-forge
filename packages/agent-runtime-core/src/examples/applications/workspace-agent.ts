import type { AgentRuntimeOptions } from '../../core/runtime.js';
import type { WorkspaceGateway } from '../../integrations/gateways/workspace.js';
import { loadSkillsFromDirectory } from '../../integrations/skills/filesystem-skill-loader.js';
import type { SkillRegistry } from '../../integrations/skills/contracts.js';
import { z } from 'zod';

import { createRuntimeHost } from '../../integrations/hosts/runtime-host.js';

export type WorkspaceAgentApplicationOptions = {
  runtime: AgentRuntimeOptions;
  workspace: WorkspaceGateway;
  skills?: SkillRegistry;
  skillBasePath?: string;
};

export function createWorkspaceAgentApplication(options: WorkspaceAgentApplicationOptions) {
  const host = createRuntimeHost({
    runtime: options.runtime,
  });
  const workspaceCommandSchema = z.object({
    command: z.string().min(1),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    timeoutMs: z.number().int().positive().optional(),
  });
  const executeWorkspaceCommand = (input: z.infer<typeof workspaceCommandSchema>) =>
    options.workspace.execute(input);

  host.runtime.registerAction({
    name: 'workspace_execute',
    description: 'Execute a shell command inside the workspace.',
    inputSchema: workspaceCommandSchema,
    execute: executeWorkspaceCommand,
  });
  host.runtime.registerAction({
    name: 'shell',
    description: 'Execute a shell command inside the workspace.',
    inputSchema: workspaceCommandSchema,
    execute: executeWorkspaceCommand,
  });
  host.runtime.registerAction({
    name: 'bash',
    description: 'Execute a bash command inside the workspace.',
    inputSchema: workspaceCommandSchema,
    execute: executeWorkspaceCommand,
  });

  return {
    runtime: host.runtime,
    journal: host.journal,
    notes: host.notes,
    async queueTask(task: { id: string; text: string; cwd?: string }) {
      await host.runtime.dispatch({
        id: task.id,
        type: 'workspace-task',
        payload: task,
      });
    },
    async runWorkspaceCommand(request: {
      command: string;
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    }) {
      return options.workspace.execute(request);
    },
    async loadSkillNotes() {
      if (!options.skills && !options.skillBasePath) {
        return [];
      }

      const skills = options.skills
        ? await options.skills.list()
        : await loadSkillsFromDirectory({
            basePath: options.skillBasePath as string,
          });
      const runtimeId = host.runtime.getSnapshot().runtimeId;

      for (const skill of skills) {
        await host.notes.set(runtimeId, {
          id: `skill:${skill.id}`,
          title: skill.name,
          text: `${skill.description}\n\n${skill.instructions}`,
        });
      }

      return skills;
    },
    async run(options: { maxSteps?: number } = {}) {
      return host.runtime.run(options);
    },
  };
}
