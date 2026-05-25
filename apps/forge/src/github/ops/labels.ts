/**
 * Labels Ops — listLabels, createLabel, updateLabel, deleteLabel,
 * addIssueLabels, removeIssueLabels
 */
import type { OpsContext } from './context';
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../agents/agent-runner-error-formatting';

const SCOPE = 'github-ops-labels';

export function createLabelsOps(ctx: OpsContext) {
  async function listLabels(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      limit?: number;
    },
  ) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('GET /repos/{owner}/{repo}/labels', {
        owner,
        repo: input.repositoryName,
        per_page: Math.min(input.limit ?? 100, 100),
      });
      return response.data.map((label) => ({
        name: label.name,
        description: label.description ?? null,
        color: label.color,
        default: label.default,
      }));
    } catch (err) {
      forgeDebug({
        scope: SCOPE,
        level: 'error',
        message: 'listLabels failed',
        context: { agentId, error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function createLabel(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      labelName: string;
      color: string;
      description?: string;
    },
  ) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('POST /repos/{owner}/{repo}/labels', {
        owner,
        repo: input.repositoryName,
        name: input.labelName,
        color: input.color,
        description: input.description,
      });
      return {
        name: response.data.name,
        description: response.data.description ?? null,
        color: response.data.color,
        default: response.data.default,
      };
    } catch (err) {
      forgeDebug({
        scope: SCOPE,
        level: 'error',
        message: 'createLabel failed',
        context: { agentId, error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function updateLabel(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      labelName: string;
      newLabelName?: string;
      color?: string;
      description?: string;
    },
  ) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('PATCH /repos/{owner}/{repo}/labels/{name}', {
        owner,
        repo: input.repositoryName,
        name: input.labelName,
        new_name: input.newLabelName,
        color: input.color,
        description: input.description,
      });
      return {
        name: response.data.name,
        description: response.data.description ?? null,
        color: response.data.color,
        default: response.data.default,
      };
    } catch (err) {
      forgeDebug({
        scope: SCOPE,
        level: 'error',
        message: 'updateLabel failed',
        context: { agentId, error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function deleteLabel(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      labelName: string;
    },
  ) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      await octokit.request('DELETE /repos/{owner}/{repo}/labels/{name}', {
        owner,
        repo: input.repositoryName,
        name: input.labelName,
      });
      return { success: true };
    } catch (err) {
      forgeDebug({
        scope: SCOPE,
        level: 'error',
        message: 'deleteLabel failed',
        context: { agentId, error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function addIssueLabels(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      issueNumber: number;
      labels: string[];
    },
  ) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request(
        'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
        {
          owner,
          repo: input.repositoryName,
          issue_number: input.issueNumber,
          labels: input.labels,
        },
      );
      return response.data.map((label) => ({
        name: label.name,
        description: label.description ?? null,
        color: label.color,
        default: label.default,
      }));
    } catch (err) {
      forgeDebug({
        scope: SCOPE,
        level: 'error',
        message: 'addIssueLabels failed',
        context: { agentId, error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function removeIssueLabels(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      issueNumber: number;
      labels: string[];
    },
  ) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      await octokit.request(
        'DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels',
        {
          owner,
          repo: input.repositoryName,
          issue_number: input.issueNumber,
          labels: input.labels.join(','),
        },
      );
      return { success: true };
    } catch (err) {
      forgeDebug({
        scope: SCOPE,
        level: 'error',
        message: 'removeIssueLabels failed',
        context: { agentId, error: errorMsg(err) },
      });
      throw err;
    }
  }

  return {
    listLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    addIssueLabels,
    removeIssueLabels,
  };
}
