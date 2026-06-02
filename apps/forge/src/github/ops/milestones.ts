/**
 * Milestones Ops — listMilestones, createMilestone, updateMilestone, deleteMilestone
 */
import type { OpsContext } from './context';
import { errorMsg } from '../../agents/error-formatting';

export function createMilestonesOps(ctx: OpsContext) {
  async function listMilestones(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      state?: 'open' | 'closed' | 'all';
      limit?: number;
    },
  ) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('GET /repos/{owner}/{repo}/milestones', {
        owner,
        repo: input.repositoryName,
        state: input.state ?? 'open',
        per_page: Math.min(input.limit ?? 100, 100),
      });
      return response.data.map((milestone) => ({
        number: milestone.number,
        title: milestone.title,
        description: milestone.description ?? null,
        state: milestone.state,
        dueOn: milestone.due_on,
        openIssues: milestone.open_issues,
        closedIssues: milestone.closed_issues,
      }));
    } catch (err) {
      ctx.forgeDebug({
        scope: 'github-milestones',
        level: 'error',
        message: '[github-milestones] listMilestones failed',
        context: { error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function createMilestone(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      title: string;
      description?: string;
      state?: 'open' | 'closed';
      dueOn?: string;
    },
  ) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('POST /repos/{owner}/{repo}/milestones', {
        owner,
        repo: input.repositoryName,
        title: input.title,
        description: input.description,
        state: input.state,
        due_on: input.dueOn ?? undefined,
      });
      return {
        number: response.data.number,
        title: response.data.title,
        description: response.data.description ?? null,
        state: response.data.state,
        dueOn: response.data.due_on,
      };
    } catch (err) {
      ctx.forgeDebug({
        scope: 'github-milestones',
        level: 'error',
        message: '[github-milestones] createMilestone failed',
        context: { error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function updateMilestone(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      milestoneNumber: number;
      title?: string;
      description?: string;
      state?: 'open' | 'closed';
      dueOn?: string | null;
    },
  ) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request(
        'PATCH /repos/{owner}/{repo}/milestones/{milestone_number}',
        {
          owner,
          repo: input.repositoryName,
          milestone_number: input.milestoneNumber,
          title: input.title,
          description: input.description,
          state: input.state,
          due_on: input.dueOn ?? undefined,
        },
      );
      return {
        number: response.data.number,
        title: response.data.title,
        description: response.data.description ?? null,
        state: response.data.state,
        dueOn: response.data.due_on,
      };
    } catch (err) {
      ctx.forgeDebug({
        scope: 'github-milestones',
        level: 'error',
        message: '[github-milestones] updateMilestone failed',
        context: { error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function deleteMilestone(
    agentId: string,
    input: {
      owner?: string;
      repositoryName: string;
      milestoneNumber: number;
    },
  ) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      await octokit.request('DELETE /repos/{owner}/{repo}/milestones/{milestone_number}', {
        owner,
        repo: input.repositoryName,
        milestone_number: input.milestoneNumber,
      });
      return { success: true };
    } catch (err) {
      ctx.forgeDebug({
        scope: 'github-milestones',
        level: 'error',
        message: '[github-milestones] deleteMilestone failed',
        context: { error: errorMsg(err) },
      });
      throw err;
    }
  }

  return { listMilestones, createMilestone, updateMilestone, deleteMilestone };
}
