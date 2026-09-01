/**
 * Pull Requests Ops — listPullRequests, createPullRequest, getPullRequest,
 * listPullRequestComments, updatePullRequest, mergePullRequest
 */
import type { Octokit } from 'octokit';
import type { OpsContext } from './context';
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../agents/error-formatting';

const SCOPE = 'github-ops-prs';

/**
 * Shared setup for github ops: acquire the installation octokit and the
 * default owner, then execute the request. Catches every failure, logs via
 * forgeDebug with the operation name, and rethrows. Replaces the ~40-line
 * try/catch+forgeDebug boilerplate that previously lived in every function.
 */
async function withGitHubOpsSetup<T>(
  ctx: OpsContext,
  agentId: string,
  operation: string,
  ownerHint: string | undefined,
  execute: (octokit: Octokit, owner: string) => Promise<T>,
): Promise<T> {
  try {
    const octokit = await ctx.getInstallationOctokit(agentId);
    const owner = await ctx.getDefaultOwner(ownerHint);
    return await execute(octokit, owner);
  } catch (err) {
    forgeDebug({
      scope: SCOPE,
      level: 'error',
      message: `${operation} failed`,
      context: { agentId, error: errorMsg(err) },
    });
    throw err;
  }
}

export function createPullRequestsOps(ctx: OpsContext) {
  async function listPullRequests(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      state?: 'open' | 'closed' | 'all';
    },
  ) {
    return await withGitHubOpsSetup(ctx, agentId, 'listPullRequests', input.owner, async (octokit, owner) => {
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
    });
  }

  async function createPullRequest(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      title: string;
      head: string;
      base: string;
      body?: string;
    },
  ) {
    return await withGitHubOpsSetup(ctx, agentId, 'createPullRequest', input.owner, async (octokit, owner) => {
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
    });
  }

  async function getPullRequest(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      pullRequestNumber: number;
    },
  ) {
    return await withGitHubOpsSetup(ctx, agentId, 'getPullRequest', input.owner, async (octokit, owner) => {
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
    });
  }

  async function listPullRequestComments(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      pullRequestNumber: number;
      direction?: 'asc' | 'desc';
      limit?: number;
    },
  ) {
    return await withGitHubOpsSetup(ctx, agentId, 'listPullRequestComments', input.owner, async (octokit, owner) => {
      const response = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
        {
          owner,
          repo: input.repositoryName,
          pull_number: input.pullRequestNumber,
          direction: input.direction ?? 'asc',
          per_page: Math.min(input.limit ?? 100, 100),
        },
      );
      return response.data.map((comment) => ({
        id: comment.id,
        body: comment.body,
        user: comment.user?.login ?? null,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
      }));
    });
  }

  async function updatePullRequest(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      pullRequestNumber: number;
      title?: string;
      body?: string;
      base?: string;
      state?: 'open' | 'closed';
    },
  ) {
    return await withGitHubOpsSetup(ctx, agentId, 'updatePullRequest', input.owner, async (octokit, owner) => {
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
    });
  }

  async function mergePullRequest(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      pullRequestNumber: number;
      mergeMethod?: 'merge' | 'squash' | 'rebase';
      commitTitle?: string;
      commitMessage?: string;
    },
  ) {
    return await withGitHubOpsSetup(ctx, agentId, 'mergePullRequest', input.owner, async (octokit, owner) => {
      const response = await octokit.request(
        'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge',
        {
          owner,
          repo: input.repositoryName,
          pull_number: input.pullRequestNumber,
          merge_method: input.mergeMethod ?? 'merge',
          commit_title: input.commitTitle,
          commit_message: input.commitMessage,
        },
      );
      return {
        merged: response.data.merged,
        message: response.data.message,
        sha: response.data.sha,
      };
    });
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
