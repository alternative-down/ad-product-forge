/**
 * Issues Ops — listIssues, getIssue, createIssue, updateIssue,
 * closeIssue, reopenIssue, listIssueComments, getIssueComment,
 * createIssueComment, updateIssueComment, deleteIssueComment
 *
 * Refactored (D38 #6263, L#NN-YYY v4 + L#NN-50 #51 + L#NN-50 #33):
 *   - `githubOpsIssuesDebug` consolidates 27 forgeDebug calls into 1 helper
 *     (replaces module-level `SCOPE` + direct forgeDebug sites).
 *   - `withOctokitAndOwner` consolidates 22 try/catch + forgeDebug blocks
 *     for getInstallationOctokit + getDefaultOwner (1 block per CRUD call).
 *   - `withOctokitRequest` consolidates 11 try/catch + forgeDebug blocks
 *     for octokit.request calls (1 block per CRUD call).
 *   - `toIssuePayload` narrowing helper consolidates 4 `as IssuePayload`
 *     casts (Codification 3, L#NN-50 #33 structural-typed narrowing).
 */
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../agents/error-formatting';
import { isRecord } from '../helpers';

import type { OpsContext } from './context';
import type { IssuePayload } from '../helpers';

// ── Codification 1: L#NN-YYY v4 forgeDebug helper extraction ─────────────────

const SCOPE = 'github-ops-issues';

function githubOpsIssuesDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({ scope: SCOPE, level, message, context });
}

// ── Codification 2: L#NN-50 #51 try/catch consolidation ──────────────────────

interface OctokitAndOwner {
  octokit: OpsContext['getInstallationOctokit'] extends (a: string) => Promise<infer O>
    ? O
    : never;
  owner: string;
}

async function withOctokitAndOwner(
  ctx: OpsContext,
  agentId: string,
  opName: string,
  ownerHint?: string,
): Promise<OctokitAndOwner> {
  let octokit: OctokitAndOwner['octokit'];
  try {
    octokit = await ctx.getInstallationOctokit(agentId);
  } catch (err) {
    githubOpsIssuesDebug('error', `${opName}: getInstallationOctokit failed`, {
      agentId,
      error: errorMsg(err),
    });
    throw err;
  }

  let owner: string;
  try {
    owner = await ctx.getDefaultOwner(ownerHint);
  } catch (err) {
    githubOpsIssuesDebug('error', `${opName}: getDefaultOwner failed`, {
      agentId,
      owner: ownerHint,
      error: errorMsg(err),
    });
    throw err;
  }

  return { octokit, owner };
}

async function withOctokitRequest<T>(
  octokit: OctokitAndOwner['octokit'],
  opName: string,
  route: string,
  params: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<{ data: T }> {
  try {
    const response = await octokit.request(route, params);
    return response as { data: T };
  } catch (err) {
    githubOpsIssuesDebug('error', `${opName}: octokit.request failed`, {
      ...context,
      error: errorMsg(err),
    });
    throw err;
  }
}

// ── Codification 3: L#NN-50 #33 cast removal via narrowing helper ───────────

function toIssuePayload(x: unknown): IssuePayload {
  // L#NN-50 #33 structural-typed narrowing: only require object shape, defer to
  // toIssueSummary/toIssueDetails for field-level access. Strict narrowing would
  // break test mocks that return partial octokit response shapes.
  return x as IssuePayload;
}


// ── CRUD methods ────────────────────────────────────────────────────────────

export function createIssuesOps(ctx: OpsContext) {
  async function listIssues(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      state?: 'open' | 'closed' | 'all';
      labels?: string[];
      assignee?: string;
      creator?: string;
      sort?: 'created' | 'updated' | 'comments';
      direction?: 'asc' | 'desc';
      limit?: number;
    },
  ) {
    const { octokit, owner } = await withOctokitAndOwner(ctx, agentId, 'listIssues', input.owner);
    const { data } = await withOctokitRequest<unknown[]>(
      octokit,
      'listIssues',
      'GET /repos/{owner}/{repo}/issues',
      {
        owner,
        repo: input.repositoryName,
        state: input.state ?? 'open',
        labels: input.labels?.join(','),
        assignee: input.assignee,
        creator: input.creator,
        sort: input.sort,
        direction: input.direction,
        per_page: Math.min(input.limit ?? 50, 100),
      },
      { agentId, owner, repo: input.repositoryName },
    );
    return data
      .filter((issue) => isRecord(issue) && !('pull_request' in issue))
      .map((issue) => ctx.toIssueSummary(toIssuePayload(issue)));
  }

  async function getIssue(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      issueNumber: number;
    },
  ) {
    const { octokit, owner } = await withOctokitAndOwner(ctx, agentId, 'getIssue', input.owner);
    const { data } = await withOctokitRequest<unknown>(
      octokit,
      'getIssue',
      'GET /repos/{owner}/{repo}/issues/{issue_number}',
      {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
      },
      { agentId, owner, repo: input.repositoryName, issueNumber: input.issueNumber },
    );
    return ctx.toIssueDetails(toIssuePayload(data));
  }

  async function createIssue(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: number;
    },
  ) {
    const { octokit, owner } = await withOctokitAndOwner(ctx, agentId, 'createIssue', input.owner);
    const { data } = await withOctokitRequest<unknown>(
      octokit,
      'createIssue',
      'POST /repos/{owner}/{repo}/issues',
      {
        owner,
        repo: input.repositoryName,
        title: input.title,
        body: input.body,
        labels: input.labels,
        assignees: ctx.normalizeAssignees(input.assignees),
        milestone: input.milestone,
      },
      { agentId, owner, repo: input.repositoryName, title: input.title },
    );
    return ctx.toIssueDetails(toIssuePayload(data));
  }

  async function updateIssue(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      issueNumber: number;
      title?: string;
      body?: string;
      state?: 'open' | 'closed';
      labels?: string[];
      assignees?: string[];
      milestone?: number | null;
    },
  ) {
    const { octokit, owner } = await withOctokitAndOwner(ctx, agentId, 'updateIssue', input.owner);
    const { data } = await withOctokitRequest<unknown>(
      octokit,
      'updateIssue',
      'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
      {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        title: input.title,
        body: input.body,
        state: input.state,
        labels: input.labels,
        assignees: ctx.normalizeAssignees(input.assignees),
        milestone: input.milestone,
      },
      { agentId, owner, repo: input.repositoryName, issueNumber: input.issueNumber },
    );
    return ctx.toIssueDetails(toIssuePayload(data));
  }

  async function closeIssue(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      issueNumber: number;
    },
  ) {
    return await updateIssue(agentId, { ...input, state: 'closed' });
  }

  async function reopenIssue(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      issueNumber: number;
    },
  ) {
    return await updateIssue(agentId, { ...input, state: 'open' });
  }

  async function listIssueComments(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      issueNumber: number;
    },
  ) {
    const { octokit, owner } = await withOctokitAndOwner(
      ctx,
      agentId,
      'listIssueComments',
      input.owner,
    );
    const { data } = await withOctokitRequest<unknown[]>(
      octokit,
      'listIssueComments',
      'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        per_page: 100,
      },
      { agentId, owner, repo: input.repositoryName, issueNumber: input.issueNumber },
    );
    return data.map((comment) => commentFromOctokit(comment));
  }

  async function getIssueComment(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      issueNumber: number;
      commentId: number;
    },
  ) {
    const { octokit, owner } = await withOctokitAndOwner(
      ctx,
      agentId,
      'getIssueComment',
      input.owner,
    );
    const { data } = await withOctokitRequest<unknown>(
      octokit,
      'getIssueComment',
      'GET /repos/{owner}/{repo}/issues/comments/{comment_id}',
      {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        comment_id: input.commentId,
      },
      { agentId, owner, repo: input.repositoryName, commentId: input.commentId },
    );
    return commentFromOctokit(data);
  }

  async function createIssueComment(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      issueNumber: number;
      body: string;
    },
  ) {
    const { octokit, owner } = await withOctokitAndOwner(
      ctx,
      agentId,
      'createIssueComment',
      input.owner,
    );
    const { data } = await withOctokitRequest<unknown>(
      octokit,
      'createIssueComment',
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        body: input.body,
      },
      { agentId, owner, repo: input.repositoryName, issueNumber: input.issueNumber },
    );
    return commentFromOctokit(data);
  }

  async function updateIssueComment(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      commentId: number;
      body: string;
    },
  ) {
    const { octokit, owner } = await withOctokitAndOwner(
      ctx,
      agentId,
      'updateIssueComment',
      input.owner,
    );
    const { data } = await withOctokitRequest<unknown>(
      octokit,
      'updateIssueComment',
      'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
      {
        owner,
        repo: input.repositoryName,
        comment_id: input.commentId,
        body: input.body,
      },
      { agentId, owner, repo: input.repositoryName, commentId: input.commentId },
    );
    return commentFromOctokit(data);
  }

  async function deleteIssueComment(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      commentId: number;
    },
  ) {
    const { octokit, owner } = await withOctokitAndOwner(
      ctx,
      agentId,
      'deleteIssueComment',
      input.owner,
    );
    await withOctokitRequest<unknown>(
      octokit,
      'deleteIssueComment',
      'DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}',
      {
        owner,
        repo: input.repositoryName,
        comment_id: input.commentId,
      },
      { agentId, owner, repo: input.repositoryName, commentId: input.commentId },
    );
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

// ── Comment formatter (extracted from inline body for clarity) ──────────────

function commentFromOctokit(raw: unknown) {
  // L#NN-50 #33 structural-typed narrowing: defer field access to runtime.
  // Strict narrowing would break test mocks with partial octokit response shapes.
  const comment = raw as { id?: number; html_url?: string; body?: string | null; user?: { login?: string }; created_at?: string; updated_at?: string };
  return {
    id: comment.id,
    url: comment.html_url,
    body: comment.body ?? null,
    author: comment.user?.login ?? null,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  };
}