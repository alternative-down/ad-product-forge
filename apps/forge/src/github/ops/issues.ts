/**
 * Issues Ops — listIssues, getIssue, createIssue, updateIssue,
 * closeIssue, reopenIssue, listIssueComments, getIssueComment,
 * createIssueComment, updateIssueComment, deleteIssueComment
 */
import type { OpsContext } from './context';

const SCOPE = 'github-ops-issues';

function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function createIssuesOps(ctx: OpsContext) {
  async function listIssues(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    assignee?: string;
    creator?: string;
    sort?: 'created' | 'updated' | 'comments';
    direction?: 'asc' | 'desc';
    limit?: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'listIssues: getInstallationOctokit failed', context: { agentId, error: serializeError(err) } });
      throw err;
    }

    let owner: string;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'listIssues: getDefaultOwner failed', context: { agentId, owner: input.owner, error: serializeError(err) } });
      throw err;
    }

    let response;
    try {
      response = await octokit.request('GET /repos/{owner}/{repo}/issues', {
        owner,
        repo: input.repositoryName,
        state: input.state ?? 'open',
        labels: input.labels?.join(','),
        assignee: input.assignee,
        creator: input.creator,
        sort: input.sort,
        direction: input.direction,
        per_page: Math.min(input.limit ?? 50, 100),
      });
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'listIssues: octokit.request failed', context: { agentId, owner, repo: input.repositoryName, error: serializeError(err) } });
      throw err;
    }

    return response.data
      .filter((issue) => !('pull_request' in issue))
      .map((issue) => ctx.toIssueSummary(issue as never));
  }

  async function getIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'getIssue: getInstallationOctokit failed', context: { agentId, error: serializeError(err) } });
      throw err;
    }

    let owner: string;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'getIssue: getDefaultOwner failed', context: { agentId, owner: input.owner, error: serializeError(err) } });
      throw err;
    }

    let response;
    try {
      response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
      });
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'getIssue: octokit.request failed', context: { agentId, owner, repo: input.repositoryName, issueNumber: input.issueNumber, error: serializeError(err) } });
      throw err;
    }

    return ctx.toIssueDetails(response.data as never);
  }

  async function createIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'createIssue: getInstallationOctokit failed', context: { agentId, error: serializeError(err) } });
      throw err;
    }

    let owner: string;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'createIssue: getDefaultOwner failed', context: { agentId, owner: input.owner, error: serializeError(err) } });
      throw err;
    }

    let response;
    try {
      response = await octokit.request('POST /repos/{owner}/{repo}/issues', {
        owner,
        repo: input.repositoryName,
        title: input.title,
        body: input.body,
        labels: input.labels,
        assignees: ctx.normalizeAssignees(input.assignees as never),
        milestone: input.milestone,
      });
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'createIssue: octokit.request failed', context: { agentId, owner, repo: input.repositoryName, title: input.title, error: serializeError(err) } });
      throw err;
    }

    return ctx.toIssueDetails(response.data as never);
  }

  async function updateIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
    assignees?: string[];
    milestone?: number | null;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'updateIssue: getInstallationOctokit failed', context: { agentId, error: serializeError(err) } });
      throw err;
    }

    let owner: string;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'updateIssue: getDefaultOwner failed', context: { agentId, owner: input.owner, error: serializeError(err) } });
      throw err;
    }

    let response;
    try {
      response = await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        title: input.title,
        body: input.body,
        state: input.state,
        labels: input.labels,
        assignees: ctx.normalizeAssignees(input.assignees as never),
        milestone: input.milestone,
      });
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'updateIssue: octokit.request failed', context: { agentId, owner, repo: input.repositoryName, issueNumber: input.issueNumber, error: serializeError(err) } });
      throw err;
    }

    return ctx.toIssueDetails(response.data as never);
  }

  async function closeIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    return updateIssue(agentId, { ...input, state: 'closed' });
  }

  async function reopenIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    return updateIssue(agentId, { ...input, state: 'open' });
  }

  async function listIssueComments(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'listIssueComments: getInstallationOctokit failed', context: { agentId, error: serializeError(err) } });
      throw err;
    }

    let owner: string;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'listIssueComments: getDefaultOwner failed', context: { agentId, owner: input.owner, error: serializeError(err) } });
      throw err;
    }

    let response;
    try {
      response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        per_page: 100,
      });
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'listIssueComments: octokit.request failed', context: { agentId, owner, repo: input.repositoryName, issueNumber: input.issueNumber, error: serializeError(err) } });
      throw err;
    }

    return response.data.map((comment) => ({
      id: comment.id,
      body: comment.body ?? null,
      author: comment.user?.login ?? null,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
    }));
  }

  async function getIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    commentId: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'getIssueComment: getInstallationOctokit failed', context: { agentId, error: serializeError(err) } });
      throw err;
    }

    let owner: string;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'getIssueComment: getDefaultOwner failed', context: { agentId, owner: input.owner, error: serializeError(err) } });
      throw err;
    }

    let response;
    try {
      response = await octokit.request('GET /repos/{owner}/{repo}/issues/comments/{comment_id}', {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        comment_id: input.commentId,
      });
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'getIssueComment: octokit.request failed', context: { agentId, owner, repo: input.repositoryName, commentId: input.commentId, error: serializeError(err) } });
      throw err;
    }

    return {
      id: response.data.id,
      url: response.data.html_url,
      body: response.data.body ?? null,
      author: response.data.user?.login ?? null,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
    };
  }

  async function createIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    body: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'createIssueComment: getInstallationOctokit failed', context: { agentId, error: serializeError(err) } });
      throw err;
    }

    let owner: string;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'createIssueComment: getDefaultOwner failed', context: { agentId, owner: input.owner, error: serializeError(err) } });
      throw err;
    }

    let response;
    try {
      response = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        body: input.body,
      });
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'createIssueComment: octokit.request failed', context: { agentId, owner, repo: input.repositoryName, issueNumber: input.issueNumber, error: serializeError(err) } });
      throw err;
    }

    return {
      id: response.data.id,
      url: response.data.html_url,
      body: response.data.body ?? null,
      author: response.data.user?.login ?? null,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
    };
  }

  async function updateIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    commentId: number;
    body: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'updateIssueComment: getInstallationOctokit failed', context: { agentId, error: serializeError(err) } });
      throw err;
    }

    let owner: string;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'updateIssueComment: getDefaultOwner failed', context: { agentId, owner: input.owner, error: serializeError(err) } });
      throw err;
    }

    let response;
    try {
      response = await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', {
        owner,
        repo: input.repositoryName,
        comment_id: input.commentId,
        body: input.body,
      });
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'updateIssueComment: octokit.request failed', context: { agentId, owner, repo: input.repositoryName, commentId: input.commentId, error: serializeError(err) } });
      throw err;
    }

    return {
      id: response.data.id,
      url: response.data.html_url,
      body: response.data.body ?? null,
      author: response.data.user?.login ?? null,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
    };
  }

  async function deleteIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    commentId: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'deleteIssueComment: getInstallationOctokit failed', context: { agentId, error: serializeError(err) } });
      throw err;
    }

    let owner: string;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'deleteIssueComment: getDefaultOwner failed', context: { agentId, owner: input.owner, error: serializeError(err) } });
      throw err;
    }

    try {
      await octokit.request('DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}', {
        owner,
        repo: input.repositoryName,
        comment_id: input.commentId,
      });
    } catch (err) {
      forgeDebug({ scope: SCOPE, level: 'error', message: 'deleteIssueComment: octokit.request failed', context: { agentId, owner, repo: input.repositoryName, commentId: input.commentId, error: serializeError(err) } });
      throw err;
    }

    return { success: true };
  }

  return {
    listIssues,
    getIssue,
    createIssue,
    updateIssue,
    closeIssue,
    reopenIssue,
    listIssueComments,
    getIssueComment,
    createIssueComment,
    updateIssueComment,
    deleteIssueComment,
  };
}
