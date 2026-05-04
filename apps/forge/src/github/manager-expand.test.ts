import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequest, mockDecryptSecret, mockEncryptSecret, mockCreateAppAuth, mockGetGitHubConfig } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockDecryptSecret: vi.fn(),
  mockEncryptSecret: vi.fn(),
  mockCreateAppAuth: vi.fn(),
  mockGetGitHubConfig: vi.fn(),
}));

vi.mock('octokit', () => { const req = mockRequest; return { App: vi.fn().mockImplementation(function() { this.octokit = { request: req }; this.getInstallationOctokit = async () => ({ request: req }); }), Octokit: vi.fn().mockImplementation((opts) => ({ request: mockRequest, auth: opts?.auth })) }; });
vi.mock('@octokit/auth-app', () => ({ createAppAuth: mockCreateAppAuth }));
vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));
vi.mock('../notifications/store', () => ({ createAgentNotificationStore: vi.fn(() => ({ addNotification: vi.fn() })) }));
vi.mock('../system-integrations/store', () => ({ createSystemIntegrationStore: () => ({ getGitHubConfig: mockGetGitHubConfig }) }));
vi.mock('../encryption/crypto', () => ({ decryptSecret: mockDecryptSecret, encryptSecret: mockEncryptSecret }));

import { createGitHubAppManager } from './manager';

const MANIFEST = { permissions: { administration: true, contents: true, issues: true, metadata: false, organization_projects: false, pull_requests: true, repository_projects: false, workflows: false }, events: { push: true, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false }, callbackUrl: '', redirectUrl: '', requestUrl: '', setupUrl: '', publicHomepageUrl: '', description: '' };
const activeJson = JSON.stringify({ status: 'active', appId: 1, privateKey: 'pk', webhookSecret: 'wh', appSlug: 'app', appName: 'App', manifestConfig: MANIFEST, installationId: 99, createdAt: 1 });
const pendingJson = JSON.stringify({ status: 'pending', state: 'st', appName: 'App', manifestConfig: MANIFEST, createdAt: 1 });

function buildConfig(org, dbFirst) {
  return {
    db: {
      query: {
        agentProviders: { findFirst: vi.fn().mockResolvedValue(dbFirst), findMany: vi.fn().mockResolvedValue([]) },
        agents: { findFirst: vi.fn() },
      },
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue({}) })),
      update: vi.fn(() => ({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) })),
    },
    httpServer: { registerRoute: vi.fn(), route: vi.fn() },
    publicBaseUrl: 'https://forge.example.com',
    integrations: { getGitHubConfig: mockGetGitHubConfig.mockResolvedValue(org) },
    agents: { get: vi.fn().mockResolvedValue({ request: mockRequest }), set: vi.fn(), has: vi.fn(), delete: vi.fn() },
  };
}

const df = (active = true) => ({ id: 'p1', agentId: 'a1', providerType: 'github-app', encryptedCredentials: active ? activeJson : pendingJson });

describe('createGitHubAppManager', () => {
  beforeEach(() => {
    mockRequest.mockClear().mockReset();
    mockDecryptSecret.mockClear().mockReset();
    mockEncryptSecret.mockClear().mockReset();
    mockCreateAppAuth.mockClear().mockReset();
    mockGetGitHubConfig.mockClear().mockReset();
    mockDecryptSecret.mockReturnValue(activeJson);
    mockCreateAppAuth.mockImplementation(async () => ({ token: 'tok', expiresAt: 9999 }));
  });
    describe('deleteAgentApp', () => {
        it('calls DELETE when active', async () => {
            mockRequest.mockResolvedValue({ status: 204 });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).deleteAgentApp('a1');expect(mockRequest).toHaveBeenCalledWith('DELETE /app/installations/{installation_id}', { installation_id: 99 });
        });
        it('returns early when no credentials', async () => {
            await expect(createGitHubAppManager(buildConfig({ organization: 'o' }, null)).deleteAgentApp('a1')).resolves.toBeUndefined();
        });
        it('returns early when pending', async () => {
            await expect(createGitHubAppManager(buildConfig({ organization: 'o' }, df(false))).deleteAgentApp('a1')).resolves.toBeUndefined();
        });
    });
    describe('getGitCredentials', () => {
        it('returns with repositoryUrl', async () => {
            mockDecryptSecret.mockReturnValue(activeJson);mockCreateAppAuth.mockReturnValue(async()=>({ token: 'tok', expiresAt: 9999 }));const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).getGitCredentials({ agentId: 'a1', repositoryName: 'my-repo' });expect(r).toMatchObject({ username: 'x-access-token', token: 'tok', repositoryUrl: 'https://github.com/o/my-repo.git' });
        });
        it('omits repositoryUrl when omitted', async () => {
            mockDecryptSecret.mockReturnValue(activeJson);mockCreateAppAuth.mockReturnValue(async()=>({ token: 'tok', expiresAt: 0 }));const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).getGitCredentials({ agentId: 'a1' });expect(r.repositoryUrl).toBeUndefined();
        });
        it('throws when not active', async () => {
            mockDecryptSecret.mockReturnValue(pendingJson);await expect(createGitHubAppManager(buildConfig({ organization: 'o' }, df(false))).getGitCredentials({ agentId: 'a1' })).rejects.toThrow('not active');
        });
        it('throws when not configured', async () => {
            mockGetGitHubConfig.mockResolvedValue(null);await expect(createGitHubAppManager(buildConfig(null)).getGitCredentials({ agentId: 'a1' })).rejects.toThrow('not configured');
        });
    });
    describe('listRepositories', () => {
        it('maps fields correctly', async () => {
            mockRequest.mockResolvedValue({ data: { repositories: [{ id: 1, name: 'r1', full_name: 'o/r1', private: true, default_branch: 'main', html_url: 'url' }] } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listRepositories('a1');expect(r).toEqual([{ id: 1, name: 'r1', fullName: 'o/r1', private: true, defaultBranch: 'main', url: 'url' }]);
        });
    });
    describe('createRepository', () => {
        it('posts with correct payload', async () => {
            mockRequest.mockResolvedValue({ data: { id: 99, name: 'new-repo', full_name: 'o/new-repo', private: true, default_branch: 'main', html_url: 'url' } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).createRepository('a1', { name: 'new-repo', description: 'desc', private: true });expect(mockRequest).toHaveBeenCalledWith('POST /orgs/{org}/repos', expect.objectContaining({ org: 'o', name: 'new-repo' }));expect(r.name).toBe('new-repo');
        });
        it('defaults private=true auto_init=false', async () => {
            mockRequest.mockResolvedValue({ data: { id: 1, name: 'x', full_name: 'o/x', private: true, default_branch: 'main', html_url: 'url' } });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).createRepository('a1', { name: 'x' });expect(mockRequest).toHaveBeenCalledWith('POST /orgs/{org}/repos', expect.objectContaining({ private: true, auto_init: false }));
        });
    });
    describe('updateRepository', () => {
        it('uses explicit owner', async () => {
            mockRequest.mockResolvedValue({ data: { id: 1, name: 'r', full_name: 'other/r', private: false, default_branch: 'main', html_url: 'url', clone_url: 'cu', ssh_url: 'su' } });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).updateRepository('a1', { owner: 'other', repositoryName: 'r', description: 'upd' });expect(mockRequest).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}', expect.objectContaining({ owner: 'other' }));
        });
        it('falls back to global org', async () => {
            mockRequest.mockResolvedValue({ data: { id: 1, name: 'r', full_name: 'o/r', private: false, default_branch: 'main', html_url: 'url', clone_url: '', ssh_url: '' } });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).updateRepository('a1', { repositoryName: 'r', name: 'ren' });expect(mockRequest).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}', expect.objectContaining({ owner: 'o' }));
        });
    });
    describe('deleteRepository', () => {
        it('calls DELETE endpoint', async () => {
            mockRequest.mockResolvedValue({ status: 204 });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).deleteRepository('a1', { repositoryName: 'rd' });expect(mockRequest).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}', { owner: 'o', repo: 'rd' });
        });
    });
    describe('getRepository', () => {
        it('returns all mapped fields', async () => {
            mockRequest.mockResolvedValue({ data: { id: 1, name: 'my-repo', full_name: 'o/my-repo', private: false, default_branch: 'main', html_url: 'url', description: 'A repo' } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).getRepository('a1', { repositoryName: 'my-repo' });expect(r).toMatchObject({ name: 'my-repo', defaultBranch: 'main' });
        });
    });
    describe('listPullRequests', () => {
        it('maps PR fields', async () => {
            mockRequest.mockResolvedValue({ data: [{ number: 1, title: 'Fix', state: 'open', html_url: 'url', head: { ref: 'fix' }, base: { ref: 'main' } }] });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listPullRequests('a1', { repositoryName: 'repo', state: 'all' });expect(r[0]).toMatchObject({ number: 1, title: 'Fix', head: 'fix', base: 'main' });
        });
        it('defaults state to open', async () => {
            mockRequest.mockResolvedValue({ data: [] });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listPullRequests('a1', { repositoryName: 'repo' });expect(mockRequest).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/pulls', expect.objectContaining({ state: 'open' }));
        });
    });
    describe('createPullRequest', () => {
        it('creates PR and returns mapped fields', async () => {
            mockRequest.mockResolvedValue({ data: { number: 42, title: 'New PR', state: 'open', html_url: 'url', head: { ref: 'feat' }, base: { ref: 'main' } } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).createPullRequest('a1', { repositoryName: 'repo', title: 'New PR', head: 'feat', base: 'main', body: 'd' });expect(r.number).toBe(42);
        });
    });
    describe('getPullRequest', () => {
        it('returns PR with merged draft body dates', async () => {
            mockRequest.mockResolvedValue({ data: { number: 10, title: 'PR', state: 'closed', html_url: 'url', head: { ref: 'f' }, base: { ref: 'm' }, body: 'body', merged: true, draft: false, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).getPullRequest('a1', { repositoryName: 'repo', pullRequestNumber: 10 });expect(r).toMatchObject({ number: 10, merged: true, draft: false, body: 'body' });
        });
    });
    describe('listPullRequestComments', () => {
        it('maps comments with user.login fallback', async () => {
            mockRequest.mockResolvedValue({ data: [{ id: 1, body: 'c1', user: { login: 'u1' }, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' }, { id: 2, body: 'c2', user: null, created_at: '2024-01-03T00:00:00Z', updated_at: '2024-01-04T00:00:00Z' }] });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listPullRequestComments('a1', { repositoryName: 'repo', pullRequestNumber: 1 });expect(r).toEqual([{ id: 1, body: 'c1', user: 'u1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' }, { id: 2, body: 'c2', user: null, createdAt: '2024-01-03T00:00:00Z', updatedAt: '2024-01-04T00:00:00Z' }]);
        });
        it('respects direction and limit', async () => {
            mockRequest.mockResolvedValue({ data: [] });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listPullRequestComments('a1', { repositoryName: 'repo', pullRequestNumber: 1, direction: 'asc', limit: 50 });expect(mockRequest).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/pulls/{pull_number}/comments', expect.objectContaining({ direction: 'asc', per_page: 50 }));
        });
    });
    describe('updatePullRequest', () => {
        it('sends PATCH with correct fields', async () => {
            mockRequest.mockResolvedValue({ data: { number: 5, title: 'Updated', state: 'open', html_url: 'url', head: { ref: 'f' }, base: { ref: 'm' } } });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).updatePullRequest('a1', { repositoryName: 'repo', pullRequestNumber: 5, title: 'Updated', body: 'new body' });expect(mockRequest).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', expect.objectContaining({ title: 'Updated', body: 'new body' }));
        });
    });
    describe('mergePullRequest', () => {
        it('calls MERGE endpoint and returns merged', async () => {
            mockRequest.mockResolvedValue({ data: { merged: true, sha: 'abc123' } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).mergePullRequest('a1', { repositoryName: 'repo', pullRequestNumber: 3, mergeMethod: 'squash' });expect(mockRequest).toHaveBeenCalledWith('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', expect.objectContaining({ merge_method: 'squash' }));expect(r.merged).toBe(true);
        });
    });
    describe('listIssues', () => {
        it('maps issue fields', async () => {
            mockRequest.mockResolvedValue({ data: [{ id: 1, number: 10, title: 'Bug', state: 'open', html_url: 'url', body: 'desc', labels: [{ name: 'bug' }], assignees: [], created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' }] });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listIssues('a1', { repositoryName: 'repo', state: 'all' });expect(r[0]).toMatchObject({ number: 10, title: 'Bug', state: 'open' });
        });
        it('defaults state to open', async () => {
            mockRequest.mockResolvedValue({ data: [] });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listIssues('a1', { repositoryName: 'repo' });expect(mockRequest).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/issues', expect.objectContaining({ state: 'open' }));
        });
    });
    describe('getIssue', () => {
        it('returns issue with all fields', async () => {
            mockRequest.mockResolvedValue({ data: { id: 1, number: 5, title: 'Issue', state: 'open', html_url: 'url', body: 'desc', labels: [], assignees: [{ login: 'user1' }], created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z', comments: 2 } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).getIssue('a1', { repositoryName: 'repo', issueNumber: 5 });expect(r).toMatchObject({ number: 5, title: 'Issue', comments: 2 });
        });
    });
    describe('createIssue', () => {
        it('creates issue and returns number', async () => {
            mockRequest.mockResolvedValue({ data: { id: 1, number: 99, title: 'New', state: 'open', html_url: 'url', body: 'desc', labels: [], assignees: [], created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', comments: 0 } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).createIssue('a1', { repositoryName: 'repo', title: 'New', body: 'desc', labels: [] });expect(r.number).toBe(99);
        });
    });
    describe('updateIssue', () => {
        it('patches issue with correct fields', async () => {
            mockRequest.mockResolvedValue({ data: { id: 1, number: 7, title: 'Updated', state: 'open', html_url: 'url', body: 'new', labels: [], assignees: [], created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z', comments: 0 } });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).updateIssue('a1', { repositoryName: 'repo', issueNumber: 7, title: 'Updated', body: 'new' });expect(mockRequest).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/issues/{issue_number}', expect.objectContaining({ title: 'Updated', body: 'new' }));
        });
    });
    describe('closeIssue', () => {
        it('calls PATCH with state=closed', async () => {
            mockRequest.mockResolvedValue({ data: { id: 1, number: 8, title: 'Closing', state: 'closed', html_url: 'url', body: '', labels: [], assignees: [], created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z', comments: 0 } });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).closeIssue('a1', { repositoryName: 'repo', issueNumber: 8 });expect(mockRequest).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/issues/{issue_number}', expect.objectContaining({ state: 'closed' }));
        });
    });
    describe('reopenIssue', () => {
        it('calls PATCH with state=open', async () => {
            mockRequest.mockResolvedValue({ data: { id: 1, number: 9, title: 'Reopening', state: 'open', html_url: 'url', body: '', labels: [], assignees: [], created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z', comments: 0 } });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).reopenIssue('a1', { repositoryName: 'repo', issueNumber: 9 });expect(mockRequest).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/issues/{issue_number}', expect.objectContaining({ state: 'open' }));
        });
    });
    describe('listIssueComments', () => {
        it('returns comment list with mapped fields', async () => {
            mockRequest.mockResolvedValue({ data: [{ id: 1, body: 'comment', user: { login: 'dev' }, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' }] });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listIssueComments('a1', { repositoryName: 'repo', issueNumber: 1 });expect(r[0]).toMatchObject({ id: 1, author: 'dev', body: 'comment' });
        });
    });
    describe('getIssueComment', () => {
        it('returns comment with all fields', async () => {
            mockRequest.mockResolvedValue({ data: { id: 55, body: 'text', user: { login: 'u1' }, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).getIssueComment('a1', { repositoryName: 'repo', commentId: 55 });expect(r).toMatchObject({ id: 55, author: 'u1', body: 'text' });
        });
    });
    describe('createIssueComment', () => {
        it('posts comment and returns comment object', async () => {
            mockRequest.mockResolvedValue({ data: { id: 88, body: 'new comment', user: { login: 'me' }, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).createIssueComment('a1', { repositoryName: 'repo', issueNumber: 1, body: 'new comment' });expect(r.id).toBe(88);expect(r.body).toBe('new comment');
        });
    });
    describe('updateIssueComment', () => {
        it('patches comment body', async () => {
            mockRequest.mockResolvedValue({ data: { id: 99, body: 'updated', user: { login: 'me' }, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' } });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).updateIssueComment('a1', { repositoryName: 'repo', commentId: 99, body: 'updated' });expect(mockRequest).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', expect.objectContaining({ body: 'updated' }));
        });
    });
    describe('deleteIssueComment', () => {
        it('calls DELETE endpoint', async () => {
            mockRequest.mockResolvedValue({ status: 204 });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).deleteIssueComment('a1', { repositoryName: 'repo', commentId: 77 });expect(mockRequest).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}', expect.objectContaining({ comment_id: 77 }));
        });
    });
    describe('listLabels', () => {
        it('returns label list', async () => {
            mockRequest.mockResolvedValue({ data: [{ id: 1, name: 'bug', color: 'ff0000', description: 'Bug label' }] });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listLabels('a1', { repositoryName: 'repo' });expect(r[0]).toMatchObject({ name: 'bug', color: 'ff0000' });
        });
    });
    describe('createLabel', () => {
        it('creates label and returns it', async () => {
            mockRequest.mockResolvedValue({ data: { id: 10, name: 'enhancement', color: '00ff00', description: 'New feature' } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).createLabel('a1', { repositoryName: 'repo', name: 'enhancement', color: '00ff00', description: 'New feature' });expect(r.name).toBe('enhancement');
        });
    });
    describe('updateLabel', () => {
        it('patches label fields', async () => {
            mockRequest.mockResolvedValue({ data: { id: 11, name: 'updated-label', color: '0000ff', description: 'Updated desc' } });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).updateLabel('a1', { repositoryName: 'repo', labelName: 'old-name', newLabelName: 'updated-label', color: '0000ff', description: 'Updated desc' });expect(mockRequest).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/labels/{name}', expect.objectContaining({ new_name: 'updated-label' }));
        });
    });
    describe('deleteLabel', () => {
        it('calls DELETE endpoint', async () => {
            mockRequest.mockResolvedValue({ status: 204 });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).deleteLabel('a1', { repositoryName: 'repo', labelName: 'to-remove' });expect(mockRequest).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}/labels/{name}', expect.objectContaining({ name: 'to-remove' }));
        });
    });
    describe('addIssueLabels', () => {
        it('posts labels and returns added labels', async () => {
            mockRequest.mockResolvedValue({ data: [{ id: 1, name: 'bug' }, { id: 2, name: 'urgent' }] });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).addIssueLabels('a1', { repositoryName: 'repo', issueNumber: 5, labels: ['bug', 'urgent'] });expect(r.map(l=>l.name)).toEqual(['bug', 'urgent']);
        });
    });
    describe('removeIssueLabels', () => {
        it('calls DELETE endpoint', async () => {
            mockRequest.mockResolvedValue({ data: [] });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).removeIssueLabels('a1', { repositoryName: 'repo', issueNumber: 5, labels: ['bug'] });expect(mockRequest).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}', expect.objectContaining({ issue_number: 5, name: 'bug' }));
        });
    });
    describe('listMilestones', () => {
        it('returns milestone list', async () => {
            mockRequest.mockResolvedValue({ data: [{ id: 1, number: 1, title: 'v1.0', state: 'open', description: 'First release', open_issues: 5, closed_issues: 2 }] });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listMilestones('a1', { repositoryName: 'repo' });expect(r[0]).toMatchObject({ number: 1, title: 'v1.0', state: 'open' });
        });
        it('defaults state to open', async () => {
            mockRequest.mockResolvedValue({ data: [] });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).listMilestones('a1', { repositoryName: 'repo' });expect(mockRequest).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/milestones', expect.objectContaining({ state: 'open' }));
        });
    });
    describe('createMilestone', () => {
        it('creates milestone and returns it', async () => {
            mockRequest.mockResolvedValue({ data: { id: 20, number: 3, title: 'v2.0', state: 'open', description: 'Next release', open_issues: 0, closed_issues: 0 } });const r=await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).createMilestone('a1', { repositoryName: 'repo', title: 'v2.0', description: 'Next release' });expect(r.number).toBe(3);
        });
    });
    describe('updateMilestone', () => {
        it('patches milestone fields', async () => {
            mockRequest.mockResolvedValue({ data: { id: 21, number: 4, title: 'Updated', state: 'open', description: 'New desc', open_issues: 1, closed_issues: 0 } });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).updateMilestone('a1', { repositoryName: 'repo', milestoneNumber: 4, title: 'Updated', description: 'New desc' });expect(mockRequest).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/milestones/{milestone_number}', expect.objectContaining({ title: 'Updated' }));
        });
    });
    describe('deleteMilestone', () => {
        it('calls DELETE endpoint', async () => {
            mockRequest.mockResolvedValue({ status: 204 });await createGitHubAppManager(buildConfig({ organization: 'o' }, df(true))).deleteMilestone('a1', { repositoryName: 'repo', milestoneNumber: 6 });expect(mockRequest).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}/milestones/{milestone_number}', expect.objectContaining({ milestone_number: 6 }));
        });
    });
});