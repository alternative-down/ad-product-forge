/**
 * Issues Ops — listIssues, getIssue, createIssue, updateIssue,
 * closeIssue, reopenIssue, listIssueComments, getIssueComment,
 * createIssueComment, updateIssueComment, deleteIssueComment
 */
import type { OpsContext } from './context.js';

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
    const octokit = await ctx.getInstallationOctokit(agentId);
    const owner = await ctx.getDefaultOwner(input.owner);
    const response = await octokit.request('GET /repos/{owner}/{repo}/issues', {
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
    return response.data
      .filter((issue) => !('pull_request' in issue))
      .map((issue) => ctx.toIssueSummary(issue as never));
  }

  async function getIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    const octokit = await ctx.getInstallationOctokit(agentId);
    const owner = await ctx.getDefaultOwner(input.owner);
    const response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
    });
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
    const octokit = await ctx.getInstallationOctokit(agentId);
    const owner = await ctx.getDefaultOwner(input.owner);
    const response = await octokit.request('POST /repos/{owner}/{repo}/issues', {
      owner,
      repo: input.repositoryName,
      title: input.title,
      body: input.body,
      labels: input.labels,
      assignees: ctx.normalizeAssignees(input.assignees as never),
      milestone: input.milestone,
    });
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
    const octokit = await ctx.getInstallationOctokit(agentId);
    const owner = await ctx.getDefaultOwner(input.owner);
    const response = await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
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
    const octokit = await ctx.getInstallationOctokit(agentId);
    const owner = await ctx.getDefaultOwner(input.owner);
    const response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
      per_page: 100,
    });
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
    const octokit = await ctx.getInstallationOctokit(agentId);
    const owner = await ctx.getDefaultOwner(input.owner);
    const response = await octokit.request('GET /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
      comment_id: input.commentId,
    });
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
    const octokit = await ctx.getInstallationOctokit(agentId);
    const owner = await ctx.getDefaultOwner(input.owner);
    const response = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
      body: input.body,
    });
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
    const octokit = await ctx.getInstallationOctokit(agentId);
    const owner = await ctx.getDefaultOwner(input.owner);
    const response = await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner,
      repo: input.repositoryName,
      comment_id: input.commentId,
      body: input.body,
    });
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
    const octokit = await ctx.getInstallationOctokit(agentId);
    const owner = await ctx.getDefaultOwner(input.owner);
    await octokit.request('DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner,
      repo: input.repositoryName,
      comment_id: input.commentId,
    });
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