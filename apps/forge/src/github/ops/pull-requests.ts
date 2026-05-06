/**
 * Pull Requests Ops — listPullRequests, getPullRequest, listPullRequestComments,
 * updatePullRequest, mergePullRequest
 */
import type { OpsContext } from './context';

const SCOPE = 'github-ops-pull-requests';

export function createPullRequestsOps(ctx: OpsContext) {
  async function listPullRequests(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    state?: 'open' | 'closed' | 'all';
    limit?: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'listPullRequests: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    let owner;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'listPullRequests: getDefaultOwner failed', context: { agentId, error: err } });
      throw err;
    }
    let response;
    try {
      response = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
        owner,
        repo: input.repositoryName,
        state: input.state ?? 'open',
        per_page: Math.min(input.limit ?? 50, 100),
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `listPullRequests failed: ${err}`, context: { agentId, owner, repo: input.repositoryName } });
      throw err;
    }
    return response.data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.html_url,
      head: pr.head.ref,
      base: pr.base.ref,
    }));
  }

  async function getPullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'getPullRequest: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    let owner;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'getPullRequest: getDefaultOwner failed', context: { agentId, error: err } });
      throw err;
    }
    let response;
    try {
      response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo: input.repositoryName,
        pull_number: input.pullRequestNumber,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `getPullRequest failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, pullRequestNumber: input.pullRequestNumber } });
      throw err;
    }
    return {
      number: response.data.number,
      title: response.data.title,
      state: response.data.state,
      url: response.data.html_url,
      head: response.data.head.ref,
      base: response.data.base.ref,
      body: response.data.body ?? null,
      merged: response.data.merged,
      draft: response.data.draft ?? false,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
    };
  }

  async function listPullRequestComments(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
    direction?: 'asc' | 'desc';
    limit?: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'listPullRequestComments: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    let owner;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'listPullRequestComments: getDefaultOwner failed', context: { agentId, error: err } });
      throw err;
    }
    let response;
    try {
      response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
        owner,
        repo: input.repositoryName,
        pull_number: input.pullRequestNumber,
        direction: input.direction ?? 'asc',
        per_page: Math.min(input.limit ?? 100, 100),
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `listPullRequestComments failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, pullRequestNumber: input.pullRequestNumber } });
      throw err;
    }
    return response.data.map((comment) => ({
      id: comment.id,
      body: comment.body,
      user: comment.user?.login ?? null,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
    }));
  }

  async function updatePullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
    title?: string;
    body?: string;
    base?: string;
    state?: 'open' | 'closed';
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'updatePullRequest: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    let owner;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'updatePullRequest: getDefaultOwner failed', context: { agentId, error: err } });
      throw err;
    }
    let response;
    try {
      response = await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo: input.repositoryName,
        pull_number: input.pullRequestNumber,
        title: input.title,
        body: input.body,
        base: input.base,
        state: input.state,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `updatePullRequest failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, pullRequestNumber: input.pullRequestNumber } });
      throw err;
    }
    return {
      number: response.data.number,
      title: response.data.title,
      state: response.data.state,
      url: response.data.html_url,
      head: response.data.head.ref,
      base: response.data.base.ref,
      body: response.data.body ?? null,
      merged: response.data.merged,
      draft: response.data.draft ?? false,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
    };
  }

  async function mergePullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
    mergeMethod?: 'merge' | 'squash' | 'rebase';
    commitTitle?: string;
    commitMessage?: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'mergePullRequest: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    let owner;
    try {
      owner = await ctx.getDefaultOwner(input.owner);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'mergePullRequest: getDefaultOwner failed', context: { agentId, error: err } });
      throw err;
    }
    let response;
    try {
      response = await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
        owner,
        repo: input.repositoryName,
        pull_number: input.pullRequestNumber,
        merge_method: input.mergeMethod ?? 'merge',
        commit_title: input.commitTitle,
        commit_message: input.commitMessage,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `mergePullRequest failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, pullRequestNumber: input.pullRequestNumber } });
      throw err;
    }
    return {
      merged: response.data.merged,
      message: response.data.message,
      sha: response.data.sha,
    };
  }

  return {
    listPullRequests,
    getPullRequest,
    listPullRequestComments,
    updatePullRequest,
    mergePullRequest,
  };
}