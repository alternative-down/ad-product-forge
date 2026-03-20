import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { GitHubAppManager } from './manager.js';

export function createGitHubTools(agentId: string, githubApps: GitHubAppManager) {
  return {
    get_github_git_credentials: createTool({
      id: 'get_github_git_credentials',
      description: 'Generate short-lived HTTPS Git credentials for this agent GitHub App. Use these credentials with git clone/pull/push over HTTPS.',
      inputSchema: z.object({
        repositoryName: z.string().optional(),
      }),
      execute: async (input) => githubApps.getGitCredentials({
        agentId,
        repositoryName: input.repositoryName,
      }),
    }),
    list_github_repositories: createTool({
      id: 'list_github_repositories',
      description: 'List the repositories currently accessible to this agent GitHub App installation.',
      inputSchema: z.object({}),
      execute: async () => githubApps.listRepositories(agentId),
    }),
    create_github_repository: createTool({
      id: 'create_github_repository',
      description: 'Create a repository in the company GitHub organization using this agent GitHub App.',
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        private: z.boolean().default(true),
        autoInit: z.boolean().default(false),
      }),
      execute: async (input) => githubApps.createRepository(agentId, input),
    }),
    get_github_repository: createTool({
      id: 'get_github_repository',
      description: 'Get repository metadata from GitHub for one repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
      }),
      execute: async (input) => githubApps.getRepository(agentId, input),
    }),
    list_github_pull_requests: createTool({
      id: 'list_github_pull_requests',
      description: 'List pull requests for one repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        state: z.enum(['open', 'closed', 'all']).default('open'),
      }),
      execute: async (input) => githubApps.listPullRequests(agentId, input),
    }),
    create_github_pull_request: createTool({
      id: 'create_github_pull_request',
      description: 'Create a pull request for one repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        title: z.string().min(1),
        head: z.string().min(1),
        base: z.string().min(1),
        body: z.string().optional(),
      }),
      execute: async (input) => githubApps.createPullRequest(agentId, input),
    }),
  };
}
