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
        repositoryName: z.string().nullish(),
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
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
      }),
      execute: async (input) => githubApps.getRepository(agentId, input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_github_repository')) {
    tools.manage_github_repository = createTool({
      id: 'manage_github_repository',
      description: 'Create, update, or delete one repository in the company GitHub organization. ⚠️ DEPRECATED: Use create_github_repository, update_github_repository, or delete_github_repository instead.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']),
        owner: z.string().nullish(),
        repositoryName: z.string().min(1).nullish(),
        name: z.string().min(1).nullish(),
        description: z.string().nullish(),
        private: z.boolean().nullish(),
        autoInit: z.boolean().nullish(),
        defaultBranch: z.string().nullish(),
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

  // --- Split tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'create_github_repository')) {
    tools.create_github_repository = createTool({
      id: 'create_github_repository',
      description: 'Create a new repository in the company GitHub organization.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        name: z.string().min(1),
        description: z.string().nullish(),
        private: z.boolean().nullish(),
        autoInit: z.boolean().nullish(),
        defaultBranch: z.string().nullish(),
      }),
      execute: async (input) => githubApps.createRepository(agentId, {
        name: input.name,
        description: input.description,
        private: input.private,
        autoInit: input.autoInit,
        defaultBranch: input.defaultBranch,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_github_repository')) {
    tools.update_github_repository = createTool({
      id: 'update_github_repository',
      description: 'Update an existing repository in the company GitHub organization.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        name: z.string().min(1).nullish(),
        description: z.string().nullish(),
        private: z.boolean().nullish(),
        defaultBranch: z.string().nullish(),
      }),
      execute: async (input) => githubApps.updateRepository(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        name: input.name,
        description: input.description,
        private: input.private,
        defaultBranch: input.defaultBranch,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_github_repository')) {
    tools.delete_github_repository = createTool({
      id: 'delete_github_repository',
      description: 'Delete a repository from the company GitHub organization.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
      }),
      execute: async (input) => githubApps.deleteRepository(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_github_pull_requests')) {
    tools.list_github_pull_requests = createTool({
      id: 'list_github_pull_requests',
      description: 'List pull requests for one repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
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
        owner: z.string().nullish(),
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
        owner: z.string().nullish(),
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
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        pullRequestNumber: z.number().int().positive().nullish(),
        title: z.string().min(1).nullish(),
        head: z.string().min(1).nullish(),
        base: z.string().min(1).nullish(),
        body: z.string().nullish(),
        state: z.enum(['open', 'closed']).nullish(),
        mergeMethod: z.enum(['merge', 'squash', 'rebase']).nullish(),
      }).superRefine((input, ctx) => {
        if (input.action === 'create') {
          for (const field of ['title', 'head', 'base'] as const) {
            if (input[field] === undefined) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is required when action is create` });
            }
          }
        }

        if ((input.action === 'update' || input.action === 'delete' || input.action === 'merge') && !input.pullRequestNumber) {
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

  // --- Split PR tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'create_github_pull_request')) {
    tools.create_github_pull_request = createTool({
      id: 'create_github_pull_request',
      description: 'Create a new pull request.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        title: z.string().min(1),
        head: z.string().min(1),
        base: z.string().min(1),
        body: z.string().nullish(),
      }),
      execute: async (input) => githubApps.createPullRequest(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        title: input.title,
        head: input.head,
        base: input.base,
        body: input.body,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_github_pull_request')) {
    tools.update_github_pull_request = createTool({
      id: 'update_github_pull_request',
      description: 'Update an existing pull request (title, body, base, or state).',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        pullRequestNumber: z.number().int().positive(),
        title: z.string().min(1).nullish(),
        body: z.string().nullish(),
        base: z.string().min(1).nullish(),
        state: z.enum(['open', 'closed']).nullish(),
      }),
      execute: async (input) => githubApps.updatePullRequest(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        pullRequestNumber: input.pullRequestNumber,
        title: input.title,
        body: input.body,
        base: input.base,
        state: input.state,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'merge_github_pull_request')) {
    tools.merge_github_pull_request = createTool({
      id: 'merge_github_pull_request',
      description: 'Merge a pull request.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        pullRequestNumber: z.number().int().positive(),
        mergeMethod: z.enum(['merge', 'squash', 'rebase']).nullish(),
      }),
      execute: async (input) => githubApps.mergePullRequest(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        pullRequestNumber: input.pullRequestNumber,
        mergeMethod: input.mergeMethod,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_github_pull_request')) {
    tools.delete_github_pull_request = createTool({
      id: 'delete_github_pull_request',
      description: 'Delete/close a pull request.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        pullRequestNumber: z.number().int().positive(),
      }),
      execute: async (input) => githubApps.updatePullRequest(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        pullRequestNumber: input.pullRequestNumber,
        state: 'closed',
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_github_issues')) {
    tools.list_github_issues = createTool({
      id: 'list_github_issues',
      description: 'List issues for one repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        state: z.enum(['open', 'closed', 'all']).default('open'),
        labels: z.array(z.string().min(1)).nullish(),
        assignee: z.string().nullish(),
        creator: z.string().nullish(),
        sort: z.enum(['created', 'updated', 'comments']).nullish(),
        direction: z.enum(['asc', 'desc']).nullish(),
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
        owner: z.string().nullish(),
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
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive().nullish(),
        title: z.string().min(1).nullish(),
        body: z.string().nullish(),
        labels: z.array(z.string().min(1)).nullish(),
        assignees: z.array(z.string().min(1)).nullish(),
        milestone: z.number().int().positive().nullable().nullish(),
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

  // --- Split Issue tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'create_github_issue')) {
    tools.create_github_issue = createTool({
      id: 'create_github_issue',
      description: 'Create a new issue in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        title: z.string().min(1),
        body: z.string().nullish(),
        labels: z.array(z.string().min(1)).nullish(),
        assignees: z.array(z.string().min(1)).nullish(),
        milestone: z.number().int().positive().nullable().nullish(),
      }),
      execute: async (input) => githubApps.createIssue(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        title: input.title,
        body: input.body,
        labels: input.labels,
        assignees: input.assignees,
        milestone: input.milestone ?? undefined,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_github_issue')) {
    tools.update_github_issue = createTool({
      id: 'update_github_issue',
      description: 'Update an existing issue in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
        title: z.string().min(1).nullish(),
        body: z.string().nullish(),
        labels: z.array(z.string().min(1)).nullish(),
        assignees: z.array(z.string().min(1)).nullish(),
        milestone: z.number().int().positive().nullable().nullish(),
      }),
      execute: async (input) => githubApps.updateIssue(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        issueNumber: input.issueNumber,
        title: input.title,
        body: input.body,
        labels: input.labels,
        assignees: input.assignees,
        milestone: input.milestone,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_github_issue')) {
    tools.delete_github_issue = createTool({
      id: 'delete_github_issue',
      description: 'Delete/close an issue in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
      }),
      execute: async (input) => githubApps.updateIssue(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        issueNumber: input.issueNumber,
        state: 'closed',
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'toggle_github_issue')) {
    tools.toggle_github_issue = createTool({
      id: 'toggle_github_issue',
      description: 'Open or close one issue in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
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
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive().nullish(),
        commentId: z.number().int().positive().nullish(),
        body: z.string().min(1).nullish(),
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

  // --- Split Issue Comment tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'list_github_issue_comments')) {
    tools.list_github_issue_comments = createTool({
      id: 'list_github_issue_comments',
      description: 'List all comments from an issue. Use to read existing comments before replying to a conversation or adding new information.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
        limit: z.number().int().positive().max(100).default(100),
      }),
      execute: async (input) => githubApps.listIssueComments(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        issueNumber: input.issueNumber,
        limit: input.limit,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_github_issue_comment')) {
    tools.get_github_issue_comment = createTool({
      id: 'get_github_issue_comment',
      description: 'Get one specific comment by its ID. Use when you need to read the full content of a single comment.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        commentId: z.number().int().positive(),
      }),
      execute: async (input) => githubApps.getIssueComment(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        commentId: input.commentId,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'create_github_issue_comment')) {
    tools.create_github_issue_comment = createTool({
      id: 'create_github_issue_comment',
      description: 'Create a new comment on an issue.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
        body: z.string().min(1),
      }),
      execute: async (input) => githubApps.createIssueComment(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        issueNumber: input.issueNumber,
        body: input.body,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_github_issue_comment')) {
    tools.update_github_issue_comment = createTool({
      id: 'update_github_issue_comment',
      description: 'Update an existing issue comment.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        commentId: z.number().int().positive(),
        body: z.string().min(1),
      }),
      execute: async (input) => githubApps.updateIssueComment(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        commentId: input.commentId,
        body: input.body,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_github_issue_comment')) {
    tools.delete_github_issue_comment = createTool({
      id: 'delete_github_issue_comment',
      description: 'Delete an issue comment.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        commentId: z.number().int().positive(),
      }),
      execute: async (input) => githubApps.deleteIssueComment(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        commentId: input.commentId,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_github_labels')) {
    tools.list_github_labels = createTool({
      id: 'list_github_labels',
      description: 'List labels available in one repository for filtering or applying to issues and PRs. Labels help categorize and track work. Use with repositoryName to get all labels, optionally filtered by owner.',
      inputSchema: z.object({
        owner: z.string().nullish(),
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
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        labelName: z.string().min(1),
        newLabelName: z.string().min(1).nullish(),
        color: z.string().nullish(),
        description: z.string().nullish(),
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

  // --- Split Label tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'create_github_label')) {
    tools.create_github_label = createTool({
      id: 'create_github_label',
      description: 'Create a new label in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        labelName: z.string().min(1),
        color: z.string(),
        description: z.string().nullish(),
      }),
      execute: async (input) => githubApps.createLabel(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        labelName: input.labelName,
        color: input.color,
        description: input.description,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_github_label')) {
    tools.update_github_label = createTool({
      id: 'update_github_label',
      description: 'Update an existing label in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        labelName: z.string().min(1),
        newLabelName: z.string().min(1).nullish(),
        color: z.string().nullish(),
        description: z.string().nullish(),
      }),
      execute: async (input) => githubApps.updateLabel(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        labelName: input.labelName,
        newLabelName: input.newLabelName,
        color: input.color,
        description: input.description,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_github_label')) {
    tools.delete_github_label = createTool({
      id: 'delete_github_label',
      description: 'Delete a label from a repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        labelName: z.string().min(1),
      }),
      execute: async (input) => githubApps.deleteLabel(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        labelName: input.labelName,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_github_milestones')) {
    tools.list_github_milestones = createTool({
      id: 'list_github_milestones',
      description: 'List milestones for one repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
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
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        milestoneNumber: z.number().int().positive().nullish(),
        title: z.string().min(1).nullish(),
        description: z.string().nullish(),
        state: z.enum(['open', 'closed']).nullish(),
        dueOn: z.string().nullish().nullable(),
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

  // --- Split Milestone tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'create_github_milestone')) {
    tools.create_github_milestone = createTool({
      id: 'create_github_milestone',
      description: 'Create a new milestone in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        title: z.string().min(1),
        description: z.string().nullish(),
        state: z.enum(['open', 'closed']).nullish(),
        dueOn: z.string().nullish().nullable(),
      }),
      execute: async (input) => githubApps.createMilestone(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        title: input.title,
        description: input.description,
        state: input.state,
        dueOn: input.dueOn ?? undefined,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_github_milestone')) {
    tools.update_github_milestone = createTool({
      id: 'update_github_milestone',
      description: 'Update an existing milestone in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        milestoneNumber: z.number().int().positive(),
        title: z.string().min(1).nullish(),
        description: z.string().nullish(),
        state: z.enum(['open', 'closed']).nullish(),
        dueOn: z.string().nullish().nullable(),
      }),
      execute: async (input) => githubApps.updateMilestone(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        milestoneNumber: input.milestoneNumber,
        title: input.title,
        description: input.description,
        state: input.state,
        dueOn: input.dueOn,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_github_milestone')) {
    tools.delete_github_milestone = createTool({
      id: 'delete_github_milestone',
      description: 'Delete a milestone from a repository.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        milestoneNumber: z.number().int().positive(),
      }),
      execute: async (input) => githubApps.deleteMilestone(agentId, {
        owner: input.owner,
        repositoryName: input.repositoryName,
        milestoneNumber: input.milestoneNumber,
      }),
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
