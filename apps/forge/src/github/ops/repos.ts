/**
 * Repos Ops — listRepositories, createRepository, updateRepository, deleteRepository, getRepository
 */
import type { OpsContext } from './context';

const SCOPE = 'github-ops-repos';

export function createReposOps(ctx: OpsContext) {
  async function listRepositories(agentId: string) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'listRepositories: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    let response;
    try {
      response = await octokit.request('GET /installation/repositories', { per_page: 100 });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `listRepositories failed: ${err}`, context: { agentId } });
      throw err;
    }
    return response.data.repositories.map((repository) => ({
      id: repository.id,
      name: repository.name,
      fullName: repository.full_name,
      private: repository.private,
      defaultBranch: repository.default_branch,
      url: repository.html_url,
    }));
  }

  async function createRepository(agentId: string, input: {
    name: string;
    description?: string;
    private?: boolean;
    autoInit?: boolean;
    defaultBranch?: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'createRepository: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    let githubConfig;
    try {
      githubConfig = await ctx.getGlobalConfig();
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'createRepository: getGlobalConfig failed', context: { agentId, error: err } });
      throw err;
    }
    let response;
    try {
      response = await octokit.request('POST /orgs/{org}/repos', {
        org: githubConfig.organization,
        name: input.name,
        description: input.description,
        private: input.private ?? true,
        auto_init: input.autoInit ?? false,
        ...(input.defaultBranch && { default_branch: input.defaultBranch }),
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `createRepository failed: ${err}`, context: { agentId, repoName: input.name } });
      throw err;
    }
    return {
      id: response.data.id,
      name: response.data.name,
      fullName: response.data.full_name,
      private: response.data.private,
      defaultBranch: response.data.default_branch,
      url: response.data.html_url,
    };
  }

  async function updateRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    name?: string;
    description?: string;
    private?: boolean;
    defaultBranch?: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'updateRepository: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    let response;
    try {
      response = await octokit.request('PATCH /repos/{owner}/{repo}', {
        owner,
        repo: input.repositoryName,
        name: input.name,
        description: input.description,
        private: input.private,
        default_branch: input.defaultBranch,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `updateRepository failed: ${err}`, context: { agentId, owner, repo: input.repositoryName } });
      throw err;
    }
    return {
      id: response.data.id,
      name: response.data.name,
      fullName: response.data.full_name,
      private: response.data.private,
      defaultBranch: response.data.default_branch,
      url: response.data.html_url,
    };
  }

  async function deleteRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'deleteRepository: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    try {
      await octokit.request('DELETE /repos/{owner}/{repo}', {
        owner,
        repo: input.repositoryName,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `deleteRepository failed: ${err}`, context: { agentId, owner, repo: input.repositoryName } });
      throw err;
    }
    return { success: true };
  }

  async function getRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
  }) {
    let octokit;
    try {
      octokit = await ctx.getInstallationOctokit(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'getRepository: getInstallationOctokit failed', context: { agentId, error: err } });
      throw err;
    }
    const owner = await ctx.getDefaultOwner(input.owner);
    let response;
    try {
      response = await octokit.request('GET /repos/{owner}/{repo}', {
        owner,
        repo: input.repositoryName,
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `getRepository failed: ${err}`, context: { agentId, owner, repo: input.repositoryName } });
      throw err;
    }
    return {
      id: response.data.id,
      name: response.data.name,
      fullName: response.data.full_name,
      private: response.data.private,
      defaultBranch: response.data.default_branch,
      url: response.data.html_url,
    };
  }

  return { listRepositories, createRepository, updateRepository, deleteRepository, getRepository };
}