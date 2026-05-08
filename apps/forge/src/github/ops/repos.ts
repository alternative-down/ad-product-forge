/**
 * Repos Ops — listRepositories, createRepository, updateRepository, deleteRepository, getRepository
 */
import type { OpsContext } from './context';

export function createReposOps(ctx: OpsContext) {
  async function listRepositories(agentId: string) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const response = await octokit.request('GET /installation/repositories', { per_page: 100 });
      return response.data.repositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        private: repository.private,
        defaultBranch: repository.default_branch,
        url: repository.html_url,
      }));
    } catch (err) {
      ctx.forgeDebug({ scope: 'github-repos', level: 'error', message: '[github-repos] listRepositories failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function createRepository(agentId: string, input: {
    name: string;
    description?: string;
    private?: boolean;
    autoInit?: boolean;
    defaultBranch?: string;
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const githubConfig = await ctx.getGlobalConfig();
      const response = await octokit.request('POST /orgs/{org}/repos', {
        org: githubConfig.organization,
        name: input.name,
        description: input.description,
        private: input.private ?? true,
        auto_init: input.autoInit ?? false,
        ...(input.defaultBranch && { default_branch: input.defaultBranch }),
      });
      return {
        id: response.data.id,
        name: response.data.name,
        fullName: response.data.full_name,
        private: response.data.private,
        defaultBranch: response.data.default_branch,
        url: response.data.html_url,
      };
    } catch (err) {
      ctx.forgeDebug({ scope: 'github-repos', level: 'error', message: '[github-repos] createRepository failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function updateRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    name?: string;
    description?: string;
    private?: boolean;
    defaultBranch?: string;
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('PATCH /repos/{owner}/{repo}', {
        owner,
        repo: input.repositoryName,
        name: input.name,
        description: input.description,
        private: input.private,
        default_branch: input.defaultBranch,
      });
      return {
        id: response.data.id,
        name: response.data.name,
        fullName: response.data.full_name,
        private: response.data.private,
        defaultBranch: response.data.default_branch,
        url: response.data.html_url,
        cloneUrl: response.data.clone_url,
        sshUrl: response.data.ssh_url,
      };
    } catch (err) {
      ctx.forgeDebug({ scope: 'github-repos', level: 'error', message: '[github-repos] updateRepository failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function deleteRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      await octokit.request('DELETE /repos/{owner}/{repo}', { owner, repo: input.repositoryName });
      return { success: true };
    } catch (err) {
      ctx.forgeDebug({ scope: 'github-repos', level: 'error', message: '[github-repos] deleteRepository failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
  }) {
    try {
      const octokit = await ctx.getInstallationOctokit(agentId);
      const owner = await ctx.getDefaultOwner(input.owner);
      const response = await octokit.request('GET /repos/{owner}/{repo}', { owner, repo: input.repositoryName });
      return {
        id: response.data.id,
        name: response.data.name,
        fullName: response.data.full_name,
        private: response.data.private,
        defaultBranch: response.data.default_branch,
        url: response.data.html_url,
        cloneUrl: response.data.clone_url,
        sshUrl: response.data.ssh_url,
      };
    } catch (err) {
      ctx.forgeDebug({ scope: 'github-repos', level: 'error', message: '[github-repos] getRepository failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  return {
    listRepositories,
    createRepository,
    updateRepository,
    deleteRepository,
    getRepository,
  };
}
