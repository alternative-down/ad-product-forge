import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { GitHubAppManager } from './manager';

function canCreateTool(allowedToolIds: Set<string> | null | undefined, toolId: string) {
  return !allowedToolIds || allowedToolIds.has(toolId);
}

export function createGitHubTools(agentId: string, githubApps: GitHubAppManager, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, unknown> = {};

  if (canCreateTool(allowedToolIds, 'get_github_git_credentials')) {
    tools.get_github_git_credentials = createTool({
      id: 'get_github_git_credentials',
      description: 'Generate short-lived HTTPS Git credentials for this agent GitHub App. Use these credentials with git clone/pull/push over HTTPS.',
      inputSchema: z.object({
        repositoryName: z.string().optional(),
      }),
      execute: async (input) => githubApps.getGitCredentials({
        agentId,
        repositoryName: input.repositoryName,
      }),
    });
  }

  if (canCreateTool(allowedToolIds, 'list_github_repositories')) {
    tools.list_github_repositories = createTool({
      id: 'list_github_repositories',
      description: 'List the repositories currently accessible to this agent GitHub App installation.',
      inputSchema: z.object({}),
      execute: async () => githubApps.listRepositories(agentId),
    });
  }

  if (canCreateTool(allowedToolIds, 'create_github_repository')) {
    tools.create_github_repository = createTool({
      id: 'create_github_repository',
      description: 'Create a repository in the company GitHub organization using this agent GitHub App.',
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        private: z.boolean().default(true),
        autoInit: z.boolean().default(false),
      }),
      execute: async (input) => githubApps.createRepository(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'get_github_repository')) {
    tools.get_github_repository = createTool({
      id: 'get_github_repository',
      description: 'Get repository metadata from GitHub for one repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
      }),
      execute: async (input) => githubApps.getRepository(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'list_github_pull_requests')) {
    tools.list_github_pull_requests = createTool({
      id: 'list_github_pull_requests',
      description: 'List pull requests for one repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        state: z.enum(['open', 'closed', 'all']).default('open'),
      }),
      execute: async (input) => githubApps.listPullRequests(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'create_github_pull_request')) {
    tools.create_github_pull_request = createTool({
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
    });
  }

  if (canCreateTool(allowedToolIds, 'list_github_issues')) {
    tools.list_github_issues = createTool({
      id: 'list_github_issues',
      description: 'List issues for one repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        state: z.enum(['open', 'closed', 'all']).default('open'),
        labels: z.array(z.string().min(1)).optional(),
        assignee: z.string().optional(),
        creator: z.string().optional(),
        sort: z.enum(['created', 'updated', 'comments']).optional(),
        direction: z.enum(['asc', 'desc']).optional(),
        limit: z.number().int().positive().max(100).default(50),
      }),
      execute: async (input) => githubApps.listIssues(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'get_github_issue')) {
    tools.get_github_issue = createTool({
      id: 'get_github_issue',
      description: 'Get one issue from one repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
      }),
      execute: async (input) => githubApps.getIssue(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'create_github_issue')) {
    tools.create_github_issue = createTool({
      id: 'create_github_issue',
      description: 'Create one issue in a repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        title: z.string().min(1),
        body: z.string().optional(),
        labels: z.array(z.string().min(1)).optional(),
        assignees: z.array(z.string().min(1)).optional(),
        milestone: z.number().int().positive().optional(),
      }),
      execute: async (input) => githubApps.createIssue(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'update_github_issue')) {
    tools.update_github_issue = createTool({
      id: 'update_github_issue',
      description: 'Partially update one issue in a repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
        title: z.string().optional(),
        body: z.string().optional(),
        state: z.enum(['open', 'closed']).optional(),
        labels: z.array(z.string().min(1)).optional(),
        assignees: z.array(z.string().min(1)).optional(),
        milestone: z.number().int().positive().nullable().optional(),
      }).refine((input) => Object.keys(input).length > 3, {
        message: 'At least one field besides owner, repositoryName, and issueNumber must be provided',
      }),
      execute: async (input) => githubApps.updateIssue(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'close_github_issue')) {
    tools.close_github_issue = createTool({
      id: 'close_github_issue',
      description: 'Close one issue in a repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
      }),
      execute: async (input) => githubApps.closeIssue(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'reopen_github_issue')) {
    tools.reopen_github_issue = createTool({
      id: 'reopen_github_issue',
      description: 'Reopen one issue in a repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
      }),
      execute: async (input) => githubApps.reopenIssue(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'list_github_issue_comments')) {
    tools.list_github_issue_comments = createTool({
      id: 'list_github_issue_comments',
      description: 'List comments for one issue.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
        limit: z.number().int().positive().max(100).default(100),
      }),
      execute: async (input) => githubApps.listIssueComments(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'create_github_issue_comment')) {
    tools.create_github_issue_comment = createTool({
      id: 'create_github_issue_comment',
      description: 'Create one comment on one issue.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
        body: z.string().min(1),
      }),
      execute: async (input) => githubApps.createIssueComment(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'list_github_labels')) {
    tools.list_github_labels = createTool({
      id: 'list_github_labels',
      description: 'List labels for one repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        limit: z.number().int().positive().max(100).default(100),
      }),
      execute: async (input) => githubApps.listLabels(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'add_github_issue_labels')) {
    tools.add_github_issue_labels = createTool({
      id: 'add_github_issue_labels',
      description: 'Add labels to one issue.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
        labels: z.array(z.string().min(1)).min(1),
      }),
      execute: async (input) => githubApps.addIssueLabels(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'remove_github_issue_labels')) {
    tools.remove_github_issue_labels = createTool({
      id: 'remove_github_issue_labels',
      description: 'Remove labels from one issue.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
        labels: z.array(z.string().min(1)).min(1),
      }),
      execute: async (input) => githubApps.removeIssueLabels(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'list_github_milestones')) {
    tools.list_github_milestones = createTool({
      id: 'list_github_milestones',
      description: 'List milestones for one repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        state: z.enum(['open', 'closed', 'all']).default('open'),
        limit: z.number().int().positive().max(100).default(100),
      }),
      execute: async (input) => githubApps.listMilestones(agentId, input),
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
