/**
 * Routing Ops — buildProvisioning, registerAgentRoutes,
 * handleRegisterPage, handleManifestCallback, handleSetupCallback, handleWebhook
 */
import type { Octokit } from 'octokit';
import { App } from 'octokit';
import type { OpsContext } from './context';
import type { AppProvisioningOps } from '../apps';
import type { GitHubAppCredentials, GitHubAppProvisioning } from '../types';

export function createRoutingOps(
  ctx: OpsContext,
  routingDeps?: Pick<AppProvisioningOps,
    | 'getCredentials'
    | 'saveCredentials'
    | 'getGlobalConfig'
    | 'createAppName'
    | 'nanoid'
    | 'normalizeManifestConfig'
    | 'DEFAULT_GITHUB_APP_MANIFEST_CONFIG'
    | 'routeCleanups'
  >
) {
  function html(status: number, body: string) {
    return { status, headers: { 'content-type': 'text/html; charset=utf-8' }, body };
  }

  function buildProvisioning(agentId: string, credentials: GitHubAppCredentials): GitHubAppProvisioning {
    if (routingDeps?.buildProvisioning) return routingDeps.buildProvisioning(agentId, credentials);
    const registrationUrl = `${ctx.config.publicBaseUrl}${ctx.getRegisterPath(agentId)}`;
    const manifestConfig = credentials.manifestConfig;
    if (credentials.status === 'created' || credentials.status === 'active') {
      return {
        agentId,
        status: credentials.status,
        registrationUrl,
        installUrl: `https://github.com/apps/${credentials.appSlug}/installations/new`,
        manifestConfig,
      };
    }
    return { agentId, status: credentials.status, registrationUrl, manifestConfig };
  }

  function registerAgentRoutes(agentId: string) {
    const cleanups = [
      ctx.config.httpServer.registerRoute({
        method: 'GET', path: ctx.getRegisterPath(agentId),
        handler: async () => handleRegisterPage(agentId),
      }),
      ctx.config.httpServer.registerRoute({
        method: 'GET', path: ctx.getManifestCallbackPath(agentId),
        handler: async (request) => handleManifestCallback(agentId, request.query.get('code'), request.query.get('state')),
      }),
      ctx.config.httpServer.registerRoute({
        method: 'GET', path: ctx.getSetupPath(agentId),
        handler: async (request) => handleSetupCallback(agentId, request.query.get('installation_id')),
      }),
      ctx.config.httpServer.registerRoute({
        method: 'POST', path: ctx.getWebhookPath(agentId),
        handler: async (request) => handleWebhook(agentId, request.headers, request.bodyText),
      }),
    ];
    ctx.routeCleanups.set(agentId, cleanups);
  }

  async function handleRegisterPage(agentId: string) {
    const credentials = await ctx.getCredentials(agentId);
    if (!credentials) {
      return html(404, `<h1>GitHub App not provisioned</h1><p>No pending GitHub App configuration exists for agent ${ctx.escapeHtml(agentId)}.</p>`);
    }
    if (credentials.status !== 'pending') {
      return html(200, `<h1>GitHub App ${ctx.escapeHtml(credentials.status)}</h1>`);
    }
    const githubConfig = await ctx.getGlobalConfig();
    const manifest = JSON.stringify({
      name: credentials.appName,
      url: githubConfig.appHomeUrl,
      redirect_url: `${ctx.config.publicBaseUrl}${ctx.getManifestCallbackPath(agentId)}`,
      setup_url: `${ctx.config.publicBaseUrl}${ctx.getSetupPath(agentId)}`,
      hook_attributes: { url: `${ctx.config.publicBaseUrl}${ctx.getWebhookPath(agentId)}`, active: true },
      public: false,
      default_permissions: ctx.buildManifestPermissions(credentials.manifestConfig as never),
      default_events: ctx.buildManifestEvents(),
    });
    const action = `https://github.com/organizations/${encodeURIComponent(githubConfig.organization)}/settings/apps/new?state=${encodeURIComponent(credentials.state)}`;
    return html(200, `<!doctype html><html><body><form id="f" action="${ctx.escapeHtml(action)}" method="post"><input type="hidden" name="manifest" value="${ctx.escapeHtml(manifest)}" /></form><p>Redirecting…</p><script>document.getElementById('f').submit();</script></body></html>`);
  }

  async function handleManifestCallback(agentId: string, code: string | null, state: string | null) {
    const credentials = await ctx.getCredentials(agentId);
    if (!credentials || credentials.status !== 'pending') {
      return html(404, '<h1>GitHub App registration not pending</h1>');
    }
    if (!code || state !== credentials.state) {
      return html(400, '<h1>Invalid manifest callback</h1>');
    }
    const anonymousOctokit = new App({ userAgent: 'forge-app' });
    try {
      const response = await anonymousOctokit.request('POST /app-manifests/{code}/conversions', { code });
      const { pem, id: appId, webhook_secret } = response.data as { pem: string; id: number; webhook_secret: string };
      const app = new App({ appId, privateKey: pem });
      const appResponse = await app.request('GET /app');
      const slug = (appResponse.data as { slug?: string }).slug ?? 'unknown';
      const created = {
        status: 'created' as const,
        appId,
        privateKey: pem,
        webhookSecret: webhook_secret,
        appSlug: slug,
        appName: (appResponse.data as { name: string }).name,
        manifestConfig: credentials.manifestConfig,
        createdAt: credentials.createdAt,
      };
      await ctx.saveCredentials(agentId, created);
      return html(200, `<h1>GitHub App created</h1><p>Now <a href="https://github.com/apps/${ctx.escapeHtml(slug)}/installations/new">install the app</a>.</p>`);
    } catch (error) {
      return html(500, `<h1>Failed</h1><pre>${ctx.escapeHtml(String(error))}</pre>`);
    }
  }

  async function handleSetupCallback(agentId: string, installationIdValue: string | null) {
    const credentials = await ctx.getCredentials(agentId);
    if (!credentials || credentials.status !== 'created') {
      return html(404, '<h1>GitHub App not ready</h1>');
    }
    if (!installationIdValue) return html(400, '<h1>Missing installation_id</h1>');
    const installationId = Number.parseInt(installationIdValue, 10);
    if (!Number.isInteger(installationId)) return html(400, '<h1>Invalid installation_id</h1>');
    const activeCredentials: Extract<GitHubAppCredentials, { status: 'active' }> = {
      status: 'active',
      appId: credentials.appId,
      privateKey: credentials.privateKey,
      webhookSecret: credentials.webhookSecret,
      installationId,
      appSlug: credentials.appSlug,
      appName: credentials.appName,
      manifestConfig: credentials.manifestConfig,
      createdAt: credentials.createdAt,
    };
    await ctx.saveCredentials(agentId, activeCredentials);
    const githubConfig = await ctx.getGlobalConfig();
    await ctx.notifications.createNotification({
      agentId,
      content: ctx.createGitHubInstallWakeContent({ agentId, installationId, organization: githubConfig.organization, appName: activeCredentials.appName, appSlug: activeCredentials.appSlug, timestamp: Date.now() }),
    });
    return html(200, '<h1>GitHub App installed</h1>');
  }

  async function handleWebhook(agentId: string, headers: Record<string, string>, bodyText: string) {
    const event = ctx.getHeader(headers, 'x-github-event');
    const delivery = ctx.getHeader(headers, 'x-github-delivery');
    if (!event || !delivery) return html(400, '<h1>Missing webhook headers</h1>');
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(bodyText); } catch { return html(400, '<h1>Invalid JSON</h1>'); }
    if (ctx.isGitHubSelfEvent(payload)) { ctx.forgeDebug({ scope: 'github-manager', level: 'info', message: 'Ignoring self event', context: { agentId, event } }); return html(200, 'ok'); }
    ctx.forgeDebug({ scope: 'github-manager', level: 'info', message: `Webhook ${event}`, context: { agentId, delivery } });
    await ctx.notifications.createNotification({
      agentId,
      content: ctx.createGitHubWebhookWakeContent({ event, delivery, payload }),
    });
    return html(202, 'Accepted');
  }

  return { buildProvisioning, registerAgentRoutes, handleRegisterPage, handleManifestCallback, handleSetupCallback, handleWebhook };
}