/**
 * Labels Ops — listLabels, createLabel, updateLabel, deleteLabel,
 * addIssueLabels, removeIssueLabels
 */
import type { OpsContext } from './context';
import { forgeDebug } from '@forge-runtime/core';

export function createLabelsOps(ctx: OpsContext) {
  async function listLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    limit?: number;
  }) {
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
        scope: 'github-ops',
        level: 'error',
        message: `listLabels failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { agentId, repositoryName: input.repositoryName, owner: input.owner },
      });
      forgeDebug({ scope: 'labels', level: 'error', message: 'labels: operation failed', context: { error: err instanceof Error ? err.message : String(err) } });
      throw error;
    }
  }

  async function createLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
    color: string;
    description?: string;
  }) {
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
        scope: 'github-ops',
        level: 'error',
        message: `createLabel failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { agentId, repositoryName: input.repositoryName, labelName: input.labelName, owner: input.owner },
      });
      forgeDebug({ scope: 'labels', level: 'error', message: 'labels: operation failed', context: { error: err instanceof Error ? err.message : String(err) } });
      throw error;
    }
  }

  async function updateLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
    newLabelName?: string;
    color?: string;
    description?: string;
  }) {
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
        scope: 'github-ops',
        level: 'error',
        message: `updateLabel failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { agentId, repositoryName: input.repositoryName, labelName: input.labelName, owner: input.owner },
      });
      forgeDebug({ scope: 'labels', level: 'error', message: 'labels: operation failed', context: { error: err instanceof Error ? err.message : String(err) } });
      throw error;
    }
  }

  async function deleteLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
  }) {
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
        scope: 'github-ops',
        level: 'error',
        message: `deleteLabel failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { agentId, repositoryName: input.repositoryName, labelName: input.labelName, owner: input.owner },
      });
      forgeDebug({ scope: 'labels', level: 'error', message: 'labels: operation failed', context: { error: err instanceof Error ? err.message : String(err) } });
      throw error;
    }
  }

  async function addIssueLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    labels: string[];
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        labels: input.labels,
      });
      return response.data.map((label) => ({
        name: label.name,
        description: label.description ?? null,
        color: label.color,
        default: label.default,
      }));
    } catch (err) {
      forgeDebug({
        scope: 'github-ops',
        level: 'error',
        message: `addIssueLabels failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { agentId, repositoryName: input.repositoryName, issueNumber: input.issueNumber, owner: input.owner },
      });
      forgeDebug({ scope: 'labels', level: 'error', message: 'labels: operation failed', context: { error: err instanceof Error ? err.message : String(err) } });
      throw error;
    }
  }

  async function removeIssueLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    labels: string[];
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      await octokit.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels', {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        labels: input.labels.join(','),
      });
      return { success: true };
    } catch (err) {
      forgeDebug({
        scope: 'github-ops',
        level: 'error',
        message: `removeIssueLabels failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { agentId, repositoryName: input.repositoryName, issueNumber: input.issueNumber, owner: input.owner },
      });
      forgeDebug({ scope: 'labels', level: 'error', message: 'labels: operation failed', context: { error: err instanceof Error ? err.message : String(err) } });
      throw error;
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