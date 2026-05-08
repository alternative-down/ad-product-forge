/**
 * Pull Requests Ops — listPullRequests, createPullRequest, getPullRequest,
 * listPullRequestComments, updatePullRequest, mergePullRequest
 */
import type { OpsContext } from './context';
import { forgeDebug } from '@forge-runtime/core';

export function createPullRequestsOps(ctx: OpsContext) {
  async function listPullRequests(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    state?: 'open' | 'closed' | 'all';
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
        owner,
        repo: input.repositoryName,
        state: input.state ?? 'open',
        per_page: 100,
      });
      return response.data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.html_url,
        head: pr.head.ref,
        base: pr.base.ref,
      }));
    } catch (error) {
      forgeDebug({
        scope: 'github-ops',
        level: 'error',
        message: `listPullRequests failed: ${error instanceof Error ? error.message : String(error)}`,
        context: { agentId, repositoryName: input.repositoryName, owner: input.owner },
      });
      forgeDebug({ scope: "github-ops-pull-requests.ts", level: "error", message: "github-ops-pull-requests.ts: unhandled error", error: err instanceof Error ? err.message : String(err) });
      throw error;
    }
  }

  async function createPullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    title: string;
    head: string;
    base: string;
    body?: string;
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
        owner,
        repo: input.repositoryName,
        title: input.title,
        head: input.head,
        base: input.base,
        body: input.body,
      });
      return {
        number: response.data.number,
        title: response.data.title,
        state: response.data.state,
        url: response.data.html_url,
        head: response.data.head.ref,
        base: response.data.base.ref,
      };
    } catch (error) {
      forgeDebug({
        scope: 'github-ops',
        level: 'error',
        message: `createPullRequest failed: ${error instanceof Error ? error.message : String(error)}`,
        context: { agentId, repositoryName: input.repositoryName, owner: input.owner },
      });
      forgeDebug({ scope: "github-ops-pull-requests.ts", level: "error", message: "github-ops-pull-requests.ts: unhandled error", error: err instanceof Error ? err.message : String(err) });
      throw error;
    }
  }

  async function getPullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo: input.repositoryName,
        pull_number: input.pullRequestNumber,
      });
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
    } catch (error) {
      forgeDebug({
        scope: 'github-ops',
        level: 'error',
        message: `getPullRequest failed: ${error instanceof Error ? error.message : String(error)}`,
        context: { agentId, repositoryName: input.repositoryName, pullRequestNumber: input.pullRequestNumber, owner: input.owner },
      });
      forgeDebug({ scope: "github-ops-pull-requests.ts", level: "error", message: "github-ops-pull-requests.ts: unhandled error", error: err instanceof Error ? err.message : String(err) });
      throw error;
    }
  }

  async function listPullRequestComments(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
    direction?: 'asc' | 'desc';
    limit?: number;
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
        owner,
        repo: input.repositoryName,
        pull_number: input.pullRequestNumber,
        direction: input.direction ?? 'asc',
        per_page: Math.min(input.limit ?? 100, 100),
      });
      return response.data.map((comment) => ({
        id: comment.id,
        body: comment.body,
        user: comment.user?.login ?? null,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
      }));
    } catch (error) {
      forgeDebug({
        scope: 'github-ops',
        level: 'error',
        message: `listPullRequestComments failed: ${error instanceof Error ? error.message : String(error)}`,
        context: { agentId, repositoryName: input.repositoryName, pullRequestNumber: input.pullRequestNumber, owner: input.owner },
      });
      forgeDebug({ scope: "github-ops-pull-requests.ts", level: "error", message: "github-ops-pull-requests.ts: unhandled error", error: err instanceof Error ? err.message : String(err) });
      throw error;
    }
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
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo: input.repositoryName,
        pull_number: input.pullRequestNumber,
        title: input.title,
        body: input.body,
        base: input.base,
        state: input.state,
      });
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
    } catch (error) {
      forgeDebug({
        scope: 'github-ops',
        level: 'error',
        message: `updatePullRequest failed: ${error instanceof Error ? error.message : String(error)}`,
        context: { agentId, repositoryName: input.repositoryName, pullRequestNumber: input.pullRequestNumber, owner: input.owner },
      });
      forgeDebug({ scope: "github-ops-pull-requests.ts", level: "error", message: "github-ops-pull-requests.ts: unhandled error", error: err instanceof Error ? err.message : String(err) });
      throw error;
    }
  }

  async function mergePullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
    mergeMethod?: 'merge' | 'squash' | 'rebase';
    commitTitle?: string;
    commitMessage?: string;
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
        owner,
        repo: input.repositoryName,
        pull_number: input.pullRequestNumber,
        merge_method: input.mergeMethod ?? 'merge',
        commit_title: input.commitTitle,
        commit_message: input.commitMessage,
      });
      return {
        merged: response.data.merged,
        message: response.data.message,
        sha: response.data.sha,
      };
    } catch (error) {
      forgeDebug({
        scope: 'github-ops',
        level: 'error',
        message: `mergePullRequest failed: ${error instanceof Error ? error.message : String(error)}`,
        context: { agentId, repositoryName: input.repositoryName, pullRequestNumber: input.pullRequestNumber, owner: input.owner },
      });
      forgeDebug({ scope: "github-ops-pull-requests.ts", level: "error", message: "github-ops-pull-requests.ts: unhandled error", error: err instanceof Error ? err.message : String(err) });
      throw error;
    }
  }

  return {
    listPullRequests,
    createPullRequest,
    getPullRequest,
    listPullRequestComments,
    updatePullRequest,
    mergePullRequest,
  };
}