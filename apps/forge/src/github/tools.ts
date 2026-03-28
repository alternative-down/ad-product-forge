import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';
import type { GitHubAppManager } from './manager';

export function createGitHubTools(agentId: string, githubApps: GitHubAppManager, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, unknown> = {};

  if (hasToolPermission(allowedToolIds, 'get_github_git_credentials')) {
    tools.get_github_git_credentials = createTool({
      id: 'get_github_git_credentials',
      description: 'Generate short-lived HTTPS Git credentials for this agent GitHub App.',
      inputSchema: z.object({
        repositoryName: z.string().optional(),
      }),
      execute: async (input) => githubApps.getGitCredentials({
        agentId,
        repositoryName: input.repositoryName,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_github_repositories')) {
    tools.list_github_repositories = createTool({
      id: 'list_github_repositories',
      description: 'List the repositories currently accessible to this agent GitHub App installation.',
      inputSchema: z.object({}),
      execute: async () => githubApps.listRepositories(agentId),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_github_repository')) {
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

  if (hasToolPermission(allowedToolIds, 'manage_github_repository')) {
    tools.manage_github_repository = createTool({
      id: 'manage_github_repository',
      description: 'Create, update, or delete one repository in the company GitHub organization.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']),
        owner: z.string().optional(),
        repositoryName: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        private: z.boolean().optional(),
        autoInit: z.boolean().optional(),
        defaultBranch: z.string().optional(),
      }).superRefine((input, ctx) => {
        if (input.action === 'create' && !input.name) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: 'name is required when action is create' });
        }

        if ((input.action === 'update' || input.action === 'delete') && !input.repositoryName) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['repositoryName'], message: 'repositoryName is required when action is not create' });
        }
      }),
      execute: async (input) => {
        if (input.action === 'create') {
          return githubApps.createRepository(agentId, {
            name: input.name!,
            description: input.description,
            private: input.private,
            autoInit: input.autoInit,
          });
        }

        if (input.action === 'delete') {
          return githubApps.deleteRepository(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName!,
          });
        }

        return githubApps.updateRepository(agentId, {
          owner: input.owner,
          repositoryName: input.repositoryName!,
          name: input.name,
          description: input.description,
          private: input.private,
          defaultBranch: input.defaultBranch,
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_github_pull_requests')) {
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

  if (hasToolPermission(allowedToolIds, 'get_github_pull_request')) {
    tools.get_github_pull_request = createTool({
      id: 'get_github_pull_request',
      description: 'Get one pull request from one repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        pullRequestNumber: z.number().int().positive(),
      }),
      execute: async (input) => githubApps.getPullRequest(agentId, input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_github_pull_request_comments')) {
    tools.list_github_pull_request_comments = createTool({
      id: 'list_github_pull_request_comments',
      description: 'List review comments on a pull request.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        pullRequestNumber: z.number().int().positive(),
        direction: z.enum(['asc', 'desc']).default('asc'),
        limit: z.number().int().positive().max(100).default(100),
      }),
      execute: async (input) => githubApps.listPullRequestComments(agentId, input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_github_pull_request')) {
    tools.manage_github_pull_request = createTool({
      id: 'manage_github_pull_request',
      description: 'Create, update, merge, or delete one pull request.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'merge', 'delete']),
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        pullRequestNumber: z.number().int().positive().optional(),
        title: z.string().min(1).optional(),
        head: z.string().min(1).optional(),
        base: z.string().min(1).optional(),
        body: z.string().optional(),
        state: z.enum(['open', 'closed']).optional(),
        mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional(),
      }).superRefine((input, ctx) => {
        if (input.action === 'create') {
          for (const field of ['title', 'head', 'base'] as const) {
            if (input[field] === undefined) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is required when action is create` });
            }
          }
        }

        if ((input.action === 'update' || input.action === 'merge' || input.action === 'delete') && !input.pullRequestNumber) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pullRequestNumber'], message: 'pullRequestNumber is required when action is not create' });
        }
      }),
      execute: async (input) => {
        if (input.action === 'create') {
          return githubApps.createPullRequest(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            title: input.title!,
            head: input.head!,
            base: input.base!,
            body: input.body,
          });
        }

        if (input.action === 'delete') {
          return githubApps.updatePullRequest(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            pullRequestNumber: input.pullRequestNumber!,
            state: 'closed',
          });
        }

        if (input.action === 'merge') {
          return githubApps.mergePullRequest(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            pullRequestNumber: input.pullRequestNumber!,
            mergeMethod: input.mergeMethod,
          });
        }

        return githubApps.updatePullRequest(agentId, {
          owner: input.owner,
          repositoryName: input.repositoryName,
          pullRequestNumber: input.pullRequestNumber!,
          title: input.title,
          body: input.body,
          base: input.base,
          state: input.state,
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_github_issues')) {
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

  if (hasToolPermission(allowedToolIds, 'get_github_issue')) {
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

  if (hasToolPermission(allowedToolIds, 'manage_github_issue')) {
    tools.manage_github_issue = createTool({
      id: 'manage_github_issue',
      description: 'Create, update, or delete one issue in a repository.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']),
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive().optional(),
        title: z.string().min(1).optional(),
        body: z.string().optional(),
        labels: z.array(z.string().min(1)).optional(),
        assignees: z.array(z.string().min(1)).optional(),
        milestone: z.number().int().positive().nullable().optional(),
      }).superRefine((input, ctx) => {
        if (input.action === 'create' && !input.title) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['title'], message: 'title is required when action is create' });
        }

        if ((input.action === 'update' || input.action === 'delete') && !input.issueNumber) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['issueNumber'], message: 'issueNumber is required when action is not create' });
        }
      }),
      execute: async (input) => {
        if (input.action === 'create') {
          return githubApps.createIssue(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            title: input.title!,
            body: input.body,
            labels: input.labels,
            assignees: input.assignees,
            milestone: input.milestone ?? undefined,
          });
        }

        if (input.action === 'delete') {
          return githubApps.updateIssue(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            issueNumber: input.issueNumber!,
            state: 'closed',
          });
        }

        return githubApps.updateIssue(agentId, {
          owner: input.owner,
          repositoryName: input.repositoryName,
          issueNumber: input.issueNumber!,
          title: input.title,
          body: input.body,
          labels: input.labels,
          assignees: input.assignees,
          milestone: input.milestone,
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'toggle_github_issue')) {
    tools.toggle_github_issue = createTool({
      id: 'toggle_github_issue',
      description: 'Open or close one issue in a repository.',
      inputSchema: z.object({
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
        state: z.enum(['open', 'closed']),
      }),
      execute: async (input) => input.state === 'open'
        ? githubApps.reopenIssue(agentId, input)
        : githubApps.closeIssue(agentId, input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_github_issue_comment')) {
    tools.manage_github_issue_comment = createTool({
      id: 'manage_github_issue_comment',
      description: 'Create, update, or delete one issue comment.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']),
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive().optional(),
        commentId: z.number().int().positive().optional(),
        body: z.string().min(1).optional(),
      }).superRefine((input, ctx) => {
        if (input.action === 'create') {
          if (!input.issueNumber) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['issueNumber'], message: 'issueNumber is required when action is create' });
          }

          if (!input.body) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'body is required when action is create' });
          }
        }

        if ((input.action === 'update' || input.action === 'delete') && !input.commentId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['commentId'], message: 'commentId is required when action is not create' });
        }

        if (input.action === 'update' && !input.body) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'body is required when action is update' });
        }
      }),
      execute: async (input) => {
        if (input.action === 'create') {
          return githubApps.createIssueComment(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            issueNumber: input.issueNumber!,
            body: input.body!,
          });
        }

        if (input.action === 'delete') {
          return githubApps.deleteIssueComment(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            commentId: input.commentId!,
          });
        }

        return githubApps.updateIssueComment(agentId, {
          owner: input.owner,
          repositoryName: input.repositoryName,
          commentId: input.commentId!,
          body: input.body!,
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_github_labels')) {
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

  if (hasToolPermission(allowedToolIds, 'manage_github_label')) {
    tools.manage_github_label = createTool({
      id: 'manage_github_label',
      description: 'Create, update, or delete one label.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']),
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        labelName: z.string().min(1),
        newLabelName: z.string().min(1).optional(),
        color: z.string().optional(),
        description: z.string().optional(),
      }).superRefine((input, ctx) => {
        if (input.action === 'create' && !input.color) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['color'], message: 'color is required when action is create' });
        }
      }),
      execute: async (input) => {
        if (input.action === 'create') {
          return githubApps.createLabel(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            labelName: input.labelName,
            color: input.color!,
            description: input.description,
          });
        }

        if (input.action === 'delete') {
          return githubApps.deleteLabel(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            labelName: input.labelName,
          });
        }

        return githubApps.updateLabel(agentId, {
          owner: input.owner,
          repositoryName: input.repositoryName,
          labelName: input.labelName,
          newLabelName: input.newLabelName,
          color: input.color,
          description: input.description,
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_github_milestones')) {
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

  if (hasToolPermission(allowedToolIds, 'manage_github_milestone')) {
    tools.manage_github_milestone = createTool({
      id: 'manage_github_milestone',
      description: 'Create, update, or delete one milestone.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']),
        owner: z.string().optional(),
        repositoryName: z.string().min(1),
        milestoneNumber: z.number().int().positive().optional(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        state: z.enum(['open', 'closed']).optional(),
        dueOn: z.string().optional().nullable(),
      }).superRefine((input, ctx) => {
        if (input.action === 'create' && !input.title) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['title'], message: 'title is required when action is create' });
        }

        if ((input.action === 'update' || input.action === 'delete') && !input.milestoneNumber) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['milestoneNumber'], message: 'milestoneNumber is required when action is not create' });
        }
      }),
      execute: async (input) => {
        if (input.action === 'create') {
          return githubApps.createMilestone(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            title: input.title!,
            description: input.description,
            state: input.state,
            dueOn: input.dueOn ?? undefined,
          });
        }

        if (input.action === 'delete') {
          return githubApps.deleteMilestone(agentId, {
            owner: input.owner,
            repositoryName: input.repositoryName,
            milestoneNumber: input.milestoneNumber!,
          });
        }

        return githubApps.updateMilestone(agentId, {
          owner: input.owner,
          repositoryName: input.repositoryName,
          milestoneNumber: input.milestoneNumber!,
          title: input.title,
          description: input.description,
          state: input.state,
          dueOn: input.dueOn,
        });
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
