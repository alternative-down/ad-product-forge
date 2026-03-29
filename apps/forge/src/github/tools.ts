import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';
import type { GitHubAppManager } from './manager';

export function createGitHubTools(agentId: string, githubApps: GitHubAppManager, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, unknown> = {};

  if (hasToolPermission(allowedToolIds, 'get_github_git_credentials')) {
    tools.get_github_git_credentials = createTool({
      id: 'get_github_git_credentials',
      description: 'Generate temporary HTTPS credentials for authenticating with GitHub repositories. Use repositoryName to get credentials for a specific repo, or omit to get credentials for all accessible repos.',
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
      description: 'Returns a list of all repositories your GitHub App has access to, including their names, visibility, and default branch.',
      inputSchema: z.object({}),
      execute: async () => githubApps.listRepositories(agentId),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_github_repository')) {
    tools.get_github_repository = createTool({
      id: 'get_github_repository',
      description: 'Fetch detailed information about a specific repository including description, privacy status, language, topics, and contributor count. Provide repositoryName (required) and optional owner if the repository belongs to a different organization.',
      inputSchema: z.object({
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name (slug, not full URL).'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).nullish().describe('Current repository name (used for update/delete).'),
        name: z.string().min(1).nullish().describe('New repository name (required for create).'),
        description: z.string().nullish().describe('Repository description.'),
        private: z.boolean().nullish().describe('Whether the repository is private.'),
        autoInit: z.boolean().nullish().describe('Automatically initialize with a README.'),
        defaultBranch: z.string().nullish().describe('Default branch name (e.g., main, develop).'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        name: z.string().min(1).describe('The name for the new repository.'),
        description: z.string().nullish().describe('Repository description.'),
        private: z.boolean().nullish().describe('Whether the repository should be private.'),
        autoInit: z.boolean().nullish().describe('Automatically initialize with a README.'),
        defaultBranch: z.string().nullish().describe('Default branch name (e.g., main, develop).'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name to update.'),
        name: z.string().min(1).nullish().describe('New repository name.'),
        description: z.string().nullish().describe('New repository description.'),
        private: z.boolean().nullish().describe('Change privacy setting.'),
        defaultBranch: z.string().nullish().describe('New default branch name.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name to delete.'),
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
      description: 'Retrieve a list of pull requests filtered by state (open, closed, or all). Useful for reviewing pending work, closed PRs, or tracking team progress.',
      inputSchema: z.object({
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        state: z.enum(['open', 'closed', 'all']).default('open').describe('Filter by PR state.'),
      }),
      execute: async (input) => githubApps.listPullRequests(agentId, input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_github_pull_request')) {
    tools.get_github_pull_request = createTool({
      id: 'get_github_pull_request',
      description: 'Retrieve complete details of a specific pull request including title, description, author, reviewers, status, and associated branch information.',
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
      description: 'Retrieve all review comments on a pull request, including the author, timestamp, and file locations for each comment.',
      inputSchema: z.object({
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        pullRequestNumber: z.number().int().positive().describe('The pull request number.'),
        direction: z.enum(['asc', 'desc']).default('asc').describe('Sort direction for comments.'),
        limit: z.number().int().positive().max(100).default(100).describe('Maximum number of comments to return.'),
      }),
      execute: async (input) => githubApps.listPullRequestComments(agentId, input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_github_pull_request')) {
    tools.manage_github_pull_request = createTool({
      id: 'manage_github_pull_request',
      description: 'Create new pull requests, update existing PRs (title, body, base branch, state), merge completed PRs, or delete/close PRs.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'merge', 'delete']),
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        pullRequestNumber: z.number().int().positive().nullish().describe('PR number (required for update/merge/delete).'),
        title: z.string().min(1).nullish().describe('PR title (required for create).'),
        head: z.string().min(1).nullish().describe('Source branch (required for create).'),
        base: z.string().min(1).nullish().describe('Target branch (required for create).'),
        body: z.string().nullish().describe('PR description.'),
        state: z.enum(['open', 'closed']).nullish().describe('Open or close the PR.'),
        mergeMethod: z.enum(['merge', 'squash', 'rebase']).nullish().describe('Merge strategy when merging.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        title: z.string().min(1).describe('The pull request title.'),
        head: z.string().min(1).describe('The branch containing your changes.'),
        base: z.string().min(1).describe('The branch to merge into (e.g., main, develop).'),
        body: z.string().nullish().describe('Description of the changes.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        pullRequestNumber: z.number().int().positive().describe('The pull request number to update.'),
        title: z.string().min(1).nullish().describe('New PR title.'),
        body: z.string().nullish().describe('New PR body/description.'),
        base: z.string().min(1).nullish().describe('New target branch.'),
        state: z.enum(['open', 'closed']).nullish().describe('Open or close the PR.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        pullRequestNumber: z.number().int().positive().describe('The pull request number to merge.'),
        mergeMethod: z.enum(['merge', 'squash', 'rebase']).nullish().describe('Merge strategy: merge (default), squash, or rebase.'),
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
      description: 'Search and filter issues by state (open/closed/all), labels, assignees, or creator. Returns issue details including title, body, labels, and metadata.',
      inputSchema: z.object({
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        state: z.enum(['open', 'closed', 'all']).default('open').describe('Filter by issue state.'),
        labels: z.array(z.string().min(1)).nullish().describe('Filter by label names.'),
        assignee: z.string().nullish().describe('Filter by assignee username.'),
        creator: z.string().nullish().describe('Filter by issue creator username.'),
        sort: z.enum(['created', 'updated', 'comments']).nullish().describe('Sort by created, updated, or comments count.'),
        direction: z.enum(['asc', 'desc']).nullish().describe('Sort direction: asc or desc.'),
        limit: z.number().int().positive().max(100).default(50).describe('Maximum number of issues to return.'),
      }),
      execute: async (input) => githubApps.listIssues(agentId, input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_github_issue')) {
    tools.get_github_issue = createTool({
      id: 'get_github_issue',
      description: 'Fetch complete details of a specific issue including title, body, author, labels, assignees, milestone, and creation/update timestamps.',
      inputSchema: z.object({
        owner: z.string().nullish(),
        repositoryName: z.string().min(1),
        issueNumber: z.number().int().positive(),
      }),
      execute: async (input) => githubApps.getIssue(agentId, input),
    });
  }

  // --- Split Issue tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'create_github_issue')) {
    tools.create_github_issue = createTool({
      id: 'create_github_issue',
      description: 'Create a new issue in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        title: z.string().min(1).describe('The issue title.'),
        body: z.string().nullish().describe('Issue body/description.'),
        labels: z.array(z.string().min(1)).nullish().describe('Label names to apply.'),
        assignees: z.array(z.string().min(1)).nullish().describe('GitHub usernames to assign.'),
        milestone: z.number().int().positive().nullable().nullish().describe('Milestone number to assign.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        issueNumber: z.number().int().positive().describe('The issue number to update.'),
        title: z.string().min(1).nullish().describe('New issue title.'),
        body: z.string().nullish().describe('New issue body.'),
        labels: z.array(z.string().min(1)).nullish().describe('Label names to set.'),
        assignees: z.array(z.string().min(1)).nullish().describe('GitHub usernames to assign.'),
        milestone: z.number().int().positive().nullable().nullish().describe('Milestone number to set.'),
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
      description: 'Quickly open or close an issue by specifying its number and desired state (open or closed).',
      inputSchema: z.object({
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        issueNumber: z.number().int().positive().describe('The issue number.'),
        state: z.enum(['open', 'closed']).describe('The desired state: open or closed.'),
      }),
      execute: async (input) => input.state === 'open'
        ? githubApps.reopenIssue(agentId, input)
        : githubApps.closeIssue(agentId, input),
    });
  }

  // --- Split Issue Comment tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'list_github_issue_comments')) {
    tools.list_github_issue_comments = createTool({
      id: 'list_github_issue_comments',
      description: 'List all comments from an issue. Use to read existing comments before replying to a conversation or adding new information.',
      inputSchema: z.object({
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        issueNumber: z.number().int().positive().describe('The issue number.'),
        limit: z.number().int().positive().max(100).default(100).describe('Maximum number of comments to return.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        issueNumber: z.number().int().positive().describe('The issue number.'),
        body: z.string().min(1).describe('The comment body.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        commentId: z.number().int().positive().describe('The comment ID to update.'),
        body: z.string().min(1).describe('The new comment body.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        limit: z.number().int().positive().max(100).default(100).describe('Maximum number of labels to return.'),
      }),
      execute: async (input) => githubApps.listLabels(agentId, input),
    });
  }

  // --- Split Label tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'create_github_label')) {
    tools.create_github_label = createTool({
      id: 'create_github_label',
      description: 'Create a new label in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        labelName: z.string().min(1).describe('The label name.'),
        color: z.string().describe('Hex color code (e.g., "ff0000").'),
        description: z.string().nullish().describe('Label description.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        labelName: z.string().min(1).describe('The label name to update.'),
        newLabelName: z.string().min(1).nullish().describe('New label name.'),
        color: z.string().nullish().describe('New hex color code.'),
        description: z.string().nullish().describe('New label description.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        labelName: z.string().min(1).describe('The label name to delete.'),
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
      description: 'List milestones in a repository filtered by state.',
      inputSchema: z.object({
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        state: z.enum(['open', 'closed', 'all']).default('open').describe('Filter by milestone state.'),
        limit: z.number().int().positive().max(100).default(100).describe('Maximum number of milestones to return.'),
      }),
      execute: async (input) => githubApps.listMilestones(agentId, input),
    });
  }

  // --- Split Milestone tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'create_github_milestone')) {
    tools.create_github_milestone = createTool({
      id: 'create_github_milestone',
      description: 'Create a new milestone in a repository.',
      inputSchema: z.object({
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        title: z.string().min(1).describe('Milestone title.'),
        description: z.string().nullish().describe('Milestone description.'),
        state: z.enum(['open', 'closed']).nullish().describe('Open or close the milestone.'),
        dueOn: z.string().nullish().nullable().describe('Due date in ISO 8601 format.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        milestoneNumber: z.number().int().positive().describe('The milestone number to update.'),
        title: z.string().min(1).nullish().describe('New milestone title.'),
        description: z.string().nullish().describe('New milestone description.'),
        state: z.enum(['open', 'closed']).nullish().describe('New milestone state.'),
        dueOn: z.string().nullish().nullable().describe('New due date in ISO 8601 format.'),
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
        owner: z.string().nullish().describe('Organization or user owning the repository. Defaults to the company organization.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
        milestoneNumber: z.number().int().positive().describe('The milestone number to delete.'),
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
