/**
 * Labels Ops — listLabels, createLabel, updateLabel, deleteLabel,
 * addIssueLabels, removeIssueLabels
 */
import type { OpsContext } from './context';

const SCOPE = 'github-ops-labels';

export function createLabelsOps(ctx: OpsContext) {
  async function listLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    limit?: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'listLabels: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    let response;
    try {
      response = await octokit.request('GET /repos/{owner}/{repo}/labels', {
        owner,
        repo: input.repositoryName,
        per_page: Math.min(input.limit ?? 100, 100),
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `listLabels failed: ${err}`, context: { agentId, owner, repo: input.repositoryName } });
      throw err;
    }
    return response.data.map((label) => ({
      name: label.name,
      description: label.description ?? null,
      color: label.color,
      default: label.default,
    }));
  }

  async function createLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
    color: string;
    description?: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'createLabel: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    let response;
    try {
      response = await octokit.request('POST /repos/{owner}/{repo}/labels', {
        owner,
        repo: input.repositoryName,
        name: input.labelName,
        color: input.color,
        description: input.description,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `createLabel failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, labelName: input.labelName } });
      throw err;
    }
    return {
      name: response.data.name,
      description: response.data.description ?? null,
      color: response.data.color,
      default: response.data.default,
    };
  }

  async function updateLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
    newLabelName?: string;
    color?: string;
    description?: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'updateLabel: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    let response;
    try {
      response = await octokit.request('PATCH /repos/{owner}/{repo}/labels/{name}', {
        owner,
        repo: input.repositoryName,
        name: input.labelName,
        new_name: input.newLabelName,
        color: input.color,
        description: input.description,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `updateLabel failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, labelName: input.labelName } });
      throw err;
    }
    return {
      name: response.data.name,
      description: response.data.description ?? null,
      color: response.data.color,
      default: response.data.default,
    };
  }

  async function deleteLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'deleteLabel: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    try {
      await octokit.request('DELETE /repos/{owner}/{repo}/labels/{name}', {
        owner,
        repo: input.repositoryName,
        name: input.labelName,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `deleteLabel failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, labelName: input.labelName } });
      throw err;
    }
    return { success: true };
  }

  async function addIssueLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    labels: string[];
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'addIssueLabels: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    let response;
    try {
      response = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        labels: input.labels,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `addIssueLabels failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, issueNumber: input.issueNumber } });
      throw err;
    }
    return response.data.map((label) => ({
      name: label.name,
      description: label.description ?? null,
      color: label.color,
      default: label.default,
    }));
  }

  async function removeIssueLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    labels: string[];
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'removeIssueLabels: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    let response;
    try {
      response = await octokit.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels', {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        labels: input.labels,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `removeIssueLabels failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, issueNumber: input.issueNumber } });
      throw err;
    }
    return response.data.map((label) => ({
      name: label.name,
      description: label.description ?? null,
      color: label.color,
      default: label.default,
    }));
  }

  return { listLabels, createLabel, updateLabel, deleteLabel, addIssueLabels, removeIssueLabels };
}