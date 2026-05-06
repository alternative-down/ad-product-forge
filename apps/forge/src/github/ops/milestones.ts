/**
 * Milestones Ops — listMilestones, createMilestone, updateMilestone, deleteMilestone
 */
import type { OpsContext } from './context';

const SCOPE = 'github-ops-milestones';

export function createMilestonesOps(ctx: OpsContext) {
  async function listMilestones(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    state?: 'open' | 'closed' | 'all';
    limit?: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'listMilestones: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    let response;
    try {
      response = await octokit.request('GET /repos/{owner}/{repo}/milestones', {
        owner,
        repo: input.repositoryName,
        state: input.state ?? 'open',
        per_page: Math.min(input.limit ?? 100, 100),
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `listMilestones failed: ${err}`, context: { agentId, owner, repo: input.repositoryName } });
      throw err;
    }
    return response.data.map((milestone) => ({
      number: milestone.number,
      title: milestone.title,
      description: milestone.description ?? null,
      state: milestone.state,
      dueOn: milestone.due_on,
      openIssues: milestone.open_issues,
      closedIssues: milestone.closed_issues,
    }));
  }

  async function createMilestone(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    title: string;
    description?: string;
    state?: 'open' | 'closed';
    dueOn?: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'createMilestone: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    let response;
    try {
      response = await octokit.request('POST /repos/{owner}/{repo}/milestones', {
        owner,
        repo: input.repositoryName,
        title: input.title,
        description: input.description,
        state: input.state,
        due_on: input.dueOn,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `createMilestone failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, title: input.title } });
      throw err;
    }
    return {
      number: response.data.number,
      title: response.data.title,
      description: response.data.description ?? null,
      state: response.data.state,
      dueOn: response.data.due_on,
    };
  }

  async function updateMilestone(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    milestoneNumber: number;
    title?: string;
    description?: string;
    state?: 'open' | 'closed';
    dueOn?: string | null;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'updateMilestone: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    let response;
    try {
      response = await octokit.request('PATCH /repos/{owner}/{repo}/milestones/{milestone_number}', {
        owner,
        repo: input.repositoryName,
        milestone_number: input.milestoneNumber,
        title: input.title,
        description: input.description,
        state: input.state,
        due_on: input.dueOn,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `updateMilestone failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, milestoneNumber: input.milestoneNumber } });
      throw err;
    }
    return {
      number: response.data.number,
      title: response.data.title,
      description: response.data.description ?? null,
      state: response.data.state,
      dueOn: response.data.due_on,
    };
  }

  async function deleteMilestone(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    milestoneNumber: number;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'deleteMilestone: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    try {
      await octokit.request('DELETE /repos/{owner}/{repo}/milestones/{milestone_number}', {
        owner,
        repo: input.repositoryName,
        milestone_number: input.milestoneNumber,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `deleteMilestone failed: ${err}`, context: { agentId, owner, repo: input.repositoryName, milestoneNumber: input.milestoneNumber } });
      throw err;
    }
    return { success: true };
  }

  return { listMilestones, createMilestone, updateMilestone, deleteMilestone };
}